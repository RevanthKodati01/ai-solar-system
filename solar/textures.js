"use strict";
/* =====================================================================
   TexGen — procedural hyper-realistic planet texture forge
   Value-noise fBM with domain warping, seamless horizontal wrap.
   Every texture is generated once at load (< ~2s total), then cached
   on the GPU — zero per-frame cost.
   ===================================================================== */
const TexGen = (function(){

  /* ---------- PRNG + noise ---------- */
  function mulberry(seed){
    let t = seed >>> 0;
    return function(){
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* value noise, periodic in x (px = integer period in lattice cells) */
  function makeNoise(seed){
    const rand = mulberry(seed);
    const g = new Float32Array(65536);
    for(let i = 0; i < 65536; i++) g[i] = rand();
    return function(x, y, px){
      let xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
      const y0 = yi & 255, y1 = (yi + 1) & 255;
      const a = g[(y0 << 8) | (x0 & 255)], b = g[(y0 << 8) | (x1 & 255)];
      const c = g[(y1 << 8) | (x0 & 255)], d = g[(y1 << 8) | (x1 & 255)];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }

  function fbm(n, x, y, px, oct, gain){
    let amp = 1, f = 1, sum = 0, norm = 0;
    for(let o = 0; o < oct; o++){
      sum += amp * n(x * f, y * f, px * f);
      norm += amp; amp *= gain; f *= 2;
    }
    return sum / norm;
  }
  function ridge(n, x, y, px, oct){
    let amp = 1, f = 1, sum = 0, norm = 0;
    for(let o = 0; o < oct; o++){
      const v = n(x * f, y * f, px * f);
      sum += amp * (1 - Math.abs(2 * v - 1));
      norm += amp; amp *= 0.55; f *= 2;
    }
    return sum / norm;
  }

  /* ---------- helpers ---------- */
  function sstep(a, b, x){
    x = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return x * x * (3 - 2 * x);
  }
  function ramp(stops){
    const s = stops.map(function(p){
      const h = p[1];
      return [p[0], [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]];
    });
    return function(t){
      if(t <= s[0][0]) return s[0][1];
      for(let i = 1; i < s.length; i++){
        if(t <= s[i][0]){
          const f = (t - s[i-1][0]) / (s[i][0] - s[i-1][0]);
          const a = s[i-1][1], b = s[i][1];
          return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];
        }
      }
      return s[s.length-1][1];
    };
  }
  function mkCanvas(w, h){
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  function toCanvas(img){
    const c = mkCanvas(img.width, img.height);
    c.getContext("2d").putImageData(img, 0, 0);
    return c;
  }
  function craters(ctxs, W, H, count, rand, strength){
    for(let i = 0; i < count; i++){
      const r = 1.5 + rand() * rand() * (W * 0.035);
      const x = rand() * W, y = H * 0.06 + rand() * H * 0.88;
      ctxs.forEach(function(ctx){
        const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
        g.addColorStop(0,    "rgba(0,0,0," + (0.30 * strength) + ")");
        g.addColorStop(0.72, "rgba(0,0,0," + (0.10 * strength) + ")");
        g.addColorStop(0.78, "rgba(255,255,255," + (0.14 * strength) + ")");
        g.addColorStop(1,    "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      });
    }
  }

  /* =================== TERRA — ocean world w/ continents =================== */
  function genTerra(seed, W, H){
    const n = makeNoise(seed), n2 = makeNoise(seed * 7 + 101);
    const F = 6, FY = 3, SEA = 0.5;
    const col = new ImageData(W, H), bmp = new ImageData(W, H), spc = new ImageData(W, H);
    const d = col.data, bd = bmp.data, sd = spc.data;
    const rampW = ramp([[0,"#03101f"],[0.2,"#082c4e"],[0.32,"#0e4a68"],[0.42,"#177186"],[0.5,"#36a496"]]);
    const rampL = ramp([[0.5,"#ab9b76"],[0.55,"#7e9472"],[0.65,"#5b7a5e"],[0.76,"#6d7d6a"],[0.86,"#99a39b"],[1,"#e6eef0"]]);
    let i = 0;
    for(let y = 0; y < H; y++){
      const v = (y + 0.5) / H, lat = Math.abs(v - 0.5) * 2, cy = v * FY;
      for(let x = 0; x < W; x++, i += 4){
        const u = (x + 0.5) / W, cx = u * F;
        const wx = fbm(n2, cx + 13.7, cy + 5.1, F, 4, 0.5) - 0.5;
        const wy = fbm(n2, cx + 41.2, cy + 17.9, F, 4, 0.5) - 0.5;
        let h = fbm(n, cx + wx * 2.6, cy + wy * 2.6, F, 5, 0.52);
        h = Math.min(1, Math.max(0, (h - 0.5) * 1.35 + 0.5));
        let r, g, b, sp, bh;
        if(h < SEA){
          const c = rampW(h);
          r = c[0]; g = c[1]; b = c[2]; sp = 235; bh = 0.3;
        } else {
          const c = rampL(h);
          r = c[0]; g = c[1]; b = c[2]; sp = 18; bh = 0.32 + (h - SEA) * 1.4;
          const cr = ridge(n2, cx * 4, cy * 4, F * 4, 3);
          if(cr > 0.78){
            const f = Math.max(0.45, 1 - (cr - 0.78) * 2.6);
            r *= f; g *= f; b *= f; bh *= 0.82;
          }
        }
        const cap = sstep(0.74, 0.9, lat + (fbm(n, cx * 2, cy * 2, F * 2, 2, 0.5) - 0.5) * 0.18);
        if(cap > 0){
          r += (236 - r) * cap; g += (243 - g) * cap; b += (247 - b) * cap;
          sp += (70 - sp) * cap; bh = bh + (0.55 - bh) * cap;
        }
        d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255;
        const bv = Math.max(0, Math.min(1, bh)) * 255;
        bd[i] = bd[i+1] = bd[i+2] = bv; bd[i+3] = 255;
        sd[i] = sd[i+1] = sd[i+2] = sp; sd[i+3] = 255;
      }
    }
    return { map: toCanvas(col), bump: toCanvas(bmp), spec: toCanvas(spc) };
  }

  /* =================== GAS — banded giant (parametrized) =================== */
  function genGas(seed, W, H, opts){
    const n = makeNoise(seed), n2 = makeNoise(seed * 5 + 31);
    const F = 4, FY = 2;
    const B = opts.bands, WARP = opts.warp;
    const rp = ramp(opts.stops);
    const col = new ImageData(W, H), bmp = new ImageData(W, H);
    const d = col.data, bd = bmp.data;
    let i = 0;
    for(let y = 0; y < H; y++){
      const v = (y + 0.5) / H, lat = Math.abs(v - 0.5) * 2, cy = v * FY;
      for(let x = 0; x < W; x++, i += 4){
        const u = (x + 0.5) / W, cx = u * F;
        const w1 = fbm(n2, cx, cy, F, 4, 0.55) - 0.5;
        const w2 = fbm(n, cx * 4, cy * 4, F * 4, 3, 0.5) - 0.5;
        let t = 0.5 + 0.5 * Math.sin((v * B + w1 * WARP + w2 * 0.16) * 6.2832);
        t = Math.min(1, Math.max(0, t + w2 * 0.28));
        const c = rp(t);
        const limb = 1 - lat * lat * 0.22;
        d[i] = c[0] * limb; d[i+1] = c[1] * limb; d[i+2] = c[2] * limb; d[i+3] = 255;
        const bv = Math.max(0, Math.min(1, 0.5 + w2 * 0.5)) * 255;
        bd[i] = bd[i+1] = bd[i+2] = bv; bd[i+3] = 255;
      }
    }
    const cv = toCanvas(col);
    const ctx = cv.getContext("2d");
    const rand = mulberry(seed + 9);
    for(let s = 0; s < opts.storms; s++){
      const sx = rand() * W, sy = H * (0.22 + rand() * 0.56), rr = 4 + rand() * rand() * 20;
      const g = ctx.createRadialGradient(sx, sy, rr * 0.15, sx, sy, rr);
      g.addColorStop(0, opts.stormA); g.addColorStop(0.7, opts.stormB);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.translate(sx, sy); ctx.scale(1.9, 1); ctx.translate(-sx, -sy);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 6.2832); ctx.fill();
      ctx.restore();
    }
    return { map: cv, bump: toCanvas(bmp), spec: null };
  }

  /* =================== ICEWORLD — Europa-like cracked shell =================== */
  function genIceworld(seed, W, H){
    const n = makeNoise(seed), n2 = makeNoise(seed * 3 + 71);
    const F = 5, FY = 2.5;
    const col = new ImageData(W, H), bmp = new ImageData(W, H), spc = new ImageData(W, H);
    const d = col.data, bd = bmp.data, sd = spc.data;
    const rp = ramp([[0,"#7fa8b8"],[0.45,"#c8e0e8"],[0.75,"#e8f4f7"],[1,"#fcffff"]]);
    let i = 0;
    for(let y = 0; y < H; y++){
      const v = (y + 0.5) / H, cy = v * FY;
      for(let x = 0; x < W; x++, i += 4){
        const u = (x + 0.5) / W, cx = u * F;
        const h = fbm(n, cx, cy, F, 4, 0.5);
        const c = rp(Math.min(1, Math.max(0, 0.55 + (h - 0.5) * 0.9)));
        let r = c[0], g = c[1], b = c[2];
        let bh = 0.55;
        const c1 = ridge(n2, cx * 2, cy * 2, F * 2, 3);
        if(c1 > 0.78){
          const k = Math.min(1, (c1 - 0.78) * 5) * 0.7;
          r += (122 - r) * k; g += (88 - g) * k; b += (74 - b) * k; bh -= k * 0.2;
        }
        const c2 = ridge(n2, cx * 8 + 3.3, cy * 8 + 1.1, F * 8, 2);
        if(c2 > 0.85){
          const k = Math.min(1, (c2 - 0.85) * 7) * 0.4;
          r += (66 - r) * k; g += (118 - g) * k; b += (128 - b) * k;
        }
        d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255;
        const bv = Math.max(0, Math.min(1, bh + (h - 0.5) * 0.25)) * 255;
        bd[i] = bd[i+1] = bd[i+2] = bv; bd[i+3] = 255;
        sd[i] = sd[i+1] = sd[i+2] = 135; sd[i+3] = 255;
      }
    }
    return { map: toCanvas(col), bump: toCanvas(bmp), spec: toCanvas(spc) };
  }

  /* =================== DESERT — canyon world =================== */
  function genDesert(seed, W, H){
    const n = makeNoise(seed), n2 = makeNoise(seed * 11 + 41);
    const F = 6, FY = 3;
    const col = new ImageData(W, H), bmp = new ImageData(W, H);
    const d = col.data, bd = bmp.data;
    const rp = ramp([[0,"#2e1810"],[0.22,"#6e3520"],[0.42,"#a05a2e"],[0.6,"#c98548"],[0.8,"#e7b878"],[1,"#f4ddb2"]]);
    let i = 0;
    for(let y = 0; y < H; y++){
      const v = (y + 0.5) / H, lat = Math.abs(v - 0.5) * 2, cy = v * FY;
      for(let x = 0; x < W; x++, i += 4){
        const u = (x + 0.5) / W, cx = u * F;
        const w1 = fbm(n2, cx + 7.7, cy + 2.4, F, 4, 0.5) - 0.5;
        let h = fbm(n, cx + w1 * 2.2, cy + w1 * 1.6, F, 5, 0.52);
        h = Math.min(1, Math.max(0, (h - 0.5) * 1.2 + 0.5));
        const dune = 1 + 0.035 * Math.sin((v * 36 + w1 * 8) * 6.2832);
        const c = rp(h);
        let r = c[0] * dune, g = c[1] * dune, b = c[2] * dune;
        let bh = 0.3 + h * 0.6;
        const cr = ridge(n2, cx * 2, cy * 2, F * 2, 4);
        if(cr > 0.78){
          const f = Math.max(0.4, 1 - (cr - 0.78) * 3);
          r *= f; g *= f; b *= f; bh *= 0.7;
        }
        const cap = sstep(0.88, 0.97, lat + (w1 * 0.1));
        if(cap > 0){
          r += (238 - r) * cap; g += (240 - g) * cap; b += (242 - b) * cap;
        }
        d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255;
        const bv = Math.max(0, Math.min(1, bh)) * 255;
        bd[i] = bd[i+1] = bd[i+2] = bv; bd[i+3] = 255;
      }
    }
    return { map: toCanvas(col), bump: toCanvas(bmp), spec: null };
  }

  /* =================== ROCK — cratered airless world =================== */
  function genRock(seed, W, H){
    const n = makeNoise(seed), n2 = makeNoise(seed * 13 + 17);
    const F = 6, FY = 3;
    const col = new ImageData(W, H), bmp = new ImageData(W, H);
    const d = col.data, bd = bmp.data;
    const rp = ramp([[0,"#3c3a38"],[0.38,"#6b6862"],[0.68,"#8d8a82"],[1,"#bab6ac"]]);
    let i = 0;
    for(let y = 0; y < H; y++){
      const v = (y + 0.5) / H, cy = v * FY;
      for(let x = 0; x < W; x++, i += 4){
        const u = (x + 0.5) / W, cx = u * F;
        const h = fbm(n, cx, cy, F, 5, 0.5);
        const c = rp(Math.min(1, Math.max(0, h)));
        let r = c[0], g = c[1], b = c[2];
        const tp = fbm(n2, cx, cy, F, 3, 0.5);
        if(tp > 0.58){
          const k = Math.min(1, (tp - 0.58) * 3) * 0.18;
          r *= 1 + k * 0.4; g *= 1 + k * 0.18; b *= 1 - k * 0.1;
        }
        d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255;
        const bv = Math.max(0, Math.min(1, h)) * 255;
        bd[i] = bd[i+1] = bd[i+2] = bv; bd[i+3] = 255;
      }
    }
    const cv = toCanvas(col), bv2 = toCanvas(bmp);
    craters([cv.getContext("2d"), bv2.getContext("2d")], W, H, 110, mulberry(seed + 3), 1);
    return { map: cv, bump: bv2, spec: null };
  }

  /* =================== VENUS — sulfur cloud world =================== */
  function genVenus(seed, W, H){
    const n = makeNoise(seed), n2 = makeNoise(seed * 17 + 5);
    const F = 4, FY = 2;
    const col = new ImageData(W, H), bmp = new ImageData(W, H);
    const d = col.data, bd = bmp.data;
    const rp = ramp([[0,"#7a4f1e"],[0.3,"#a87830"],[0.55,"#cfa050"],[0.78,"#ecd08a"],[1,"#f8ecc8"]]);
    let i = 0;
    for(let y = 0; y < H; y++){
      const v = (y + 0.5) / H, lat = Math.abs(v - 0.5) * 2, cy = v * FY;
      for(let x = 0; x < W; x++, i += 4){
        const u = (x + 0.5) / W, cx = u * F;
        const wx = fbm(n2, cx, cy, F, 4, 0.55) - 0.5;
        let h = fbm(n, cx * 2 + wx * 4, cy * 4, F * 2, 5, 0.55);
        h += 0.05 * Math.sin((v * 26 + wx * 5) * 6.2832);
        const c = rp(Math.min(1, Math.max(0, h)));
        const limb = 1 - lat * lat * 0.16;
        d[i] = c[0] * limb; d[i+1] = c[1] * limb; d[i+2] = c[2] * limb; d[i+3] = 255;
        const bv = Math.max(0, Math.min(1, 0.5 + wx * 0.4)) * 255;
        bd[i] = bd[i+1] = bd[i+2] = bv; bd[i+3] = 255;
      }
    }
    return { map: toCanvas(col), bump: toCanvas(bmp), spec: null };
  }

  function genPlanet(type, seed, W, H){
    switch(type){
      case "terra":    return genTerra(seed, W, H);
      case "iceworld": return genIceworld(seed, W, H);
      case "desert":   return genDesert(seed, W, H);
      case "rock":     return genRock(seed, W, H);
      case "venus":    return genVenus(seed, W, H);
      case "gas": return genGas(seed, W, H, {
        bands: 11, warp: 0.85, storms: 7,
        stops: [[0,"#5b6b4f"],[0.25,"#8a9a74"],[0.5,"#c9c8a8"],[0.7,"#a9b08c"],[0.85,"#74845e"],[1,"#dfe0c4"]],
        stormA: "rgba(235,240,220,0.85)", stormB: "rgba(180,195,160,0.25)" });
      case "gas2": return genGas(seed, W, H, {
        bands: 9, warp: 0.75, storms: 5,
        stops: [[0,"#8a5560"],[0.3,"#b97f82"],[0.5,"#e3b6a8"],[0.7,"#c98e92"],[0.9,"#f0d4c8"],[1,"#9c6470"]],
        stormA: "rgba(248,228,220,0.8)", stormB: "rgba(200,150,150,0.22)" });
      case "icegiant": return genGas(seed, W, H, {
        bands: 5, warp: 0.4, storms: 2,
        stops: [[0,"#2a2350"],[0.3,"#3d3578"],[0.55,"#5a4fa8"],[0.8,"#7a6fc8"],[1,"#a89ce0"]],
        stormA: "rgba(220,215,250,0.55)", stormB: "rgba(140,130,210,0.2)" });
    }
  }

  /* =================== clouds layer (terra) =================== */
  function genClouds(seed, W, H, cover, storm){
    const n = makeNoise(seed), n2 = makeNoise(seed * 19 + 7);
    const F = 5, FY = 2.5;
    const img = new ImageData(W, H), d = img.data;
    let i = 0;
    for(let y = 0; y < H; y++){
      const v = (y + 0.5) / H, lat = Math.abs(v - 0.5) * 2, cy = v * FY;
      for(let x = 0; x < W; x++, i += 4){
        const u = (x + 0.5) / W, cx = u * F;
        const w = fbm(n2, cx, cy, F, 3, 0.5) - 0.5;
        const c = fbm(n, cx * 2 + w * 3, cy * 2 + w * 2, F * 2, 5, 0.55);
        const a = sstep(cover, cover + 0.2, c) * 0.8 + sstep(cover + 0.22, cover + 0.45, c) * 0.2;
        d[i] = d[i+1] = d[i+2] = 255;
        d[i+3] = Math.min(255, a * 235 * (1 - lat * 0.25));
      }
    }
    const cv = toCanvas(img), ctx = cv.getContext("2d");
    if(storm){
      const sx = W * 0.62, sy = H * 0.55;
      for(let a = 0; a < 21; a += 0.045){
        const r = 1.5 + a * 3.1;
        const px = sx + Math.cos(a) * r * 1.7, py = sy + Math.sin(a) * r * 0.85;
        const br = 2 + a * 0.55, al = 0.5 * (1 - a / 23);
        const g = ctx.createRadialGradient(px, py, 0, px, py, br);
        g.addColorStop(0, "rgba(255,255,255," + al + ")");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, br, 0, 6.2832); ctx.fill();
      }
    }
    return cv;
  }

  /* =================== ring strip (u = radius) =================== */
  function genRing(seed, tint){
    const W = 512, H = 32;
    const n = makeNoise(seed);
    const rand = mulberry(seed + 1);
    const img = new ImageData(W, H), d = img.data;
    const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
    for(let x = 0; x < W; x++){
      const t = x / W;
      let a = 0.35 * (0.45 + 0.55 * n(t * 128, 1.5, 128)) + 0.65 * (0.4 + 0.6 * n(t * 24, 0.5, 24));
      if(t > 0.30 && t < 0.345) a *= 0.12;
      if(t > 0.62 && t < 0.66)  a *= 0.32;
      if(t > 0.78 && t < 0.792) a *= 0.3;
      a *= sstep(0, 0.05, t) * (1 - sstep(0.92, 1, t));
      const br = 175 + 60 * n(t * 32, 2.5, 32);
      const r = br * 0.78 + tr * 0.22, g = br * 0.78 + tg * 0.22, b = br * 0.78 + tb * 0.22;
      for(let y = 0; y < H; y++){
        const i = (y * W + x) * 4;
        d[i] = r; d[i+1] = g; d[i+2] = b;
        d[i+3] = Math.min(255, a * (0.7 + 0.3 * rand()) * 235);
      }
    }
    return toCanvas(img);
  }

  /* =================== moon =================== */
  function genMoon(seed, icy){
    const W = 160, H = 80;
    const n = makeNoise(seed), n2 = makeNoise(seed * 3 + 29);
    const F = 4, FY = 2;
    const img = new ImageData(W, H), d = img.data;
    const rp = icy
      ? ramp([[0,"#6e90a1"],[0.5,"#a8bcc7"],[1,"#d8e4ea"]])
      : ramp([[0,"#46423c"],[0.45,"#75716a"],[0.75,"#98948b"],[1,"#beb9ae"]]);
    let i = 0;
    for(let y = 0; y < H; y++){
      const v = (y + 0.5) / H, cy = v * FY;
      for(let x = 0; x < W; x++, i += 4){
        const u = (x + 0.5) / W, cx = u * F;
        const h = fbm(n, cx, cy, F, 4, 0.5);
        const c = rp(Math.min(1, Math.max(0, h)));
        let r = c[0], g = c[1], b = c[2];
        if(icy){
          const cr = ridge(n2, cx * 4, cy * 4, F * 4, 2);
          if(cr > 0.82){
            const k = Math.min(1, (cr - 0.82) * 6) * 0.5;
            r += (110 - r) * k; g += (95 - g) * k; b += (88 - b) * k;
          }
        }
        d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255;
      }
    }
    const cv = toCanvas(img);
    if(!icy) craters([cv.getContext("2d")], W, H, 26, mulberry(seed + 5), 0.9);
    return cv;
  }

  /* =================== sun =================== */
  function genSun(){
    const W = 512, H = 256;
    const n = makeNoise(777);
    const F = 8, FY = 4;
    const img = new ImageData(W, H), d = img.data;
    const rp = ramp([[0,"#c84a00"],[0.35,"#f07c10"],[0.6,"#ffb240"],[0.8,"#ffd98c"],[1,"#fff4dc"]]);
    let i = 0;
    for(let y = 0; y < H; y++){
      const v = (y + 0.5) / H, cy = v * FY;
      for(let x = 0; x < W; x++, i += 4){
        const u = (x + 0.5) / W, cx = u * F;
        let t = fbm(n, cx * 2, cy * 2, F * 2, 4, 0.55);
        t = Math.pow(Math.min(1, Math.max(0, (t - 0.5) * 1.5 + 0.55)), 1.15);
        const c = rp(t);
        d[i] = c[0]; d[i+1] = c[1]; d[i+2] = c[2]; d[i+3] = 255;
      }
    }
    const cv = toCanvas(img), ctx = cv.getContext("2d");
    const rand = mulberry(99);
    for(let s = 0; s < 5; s++){
      const x = rand() * W, y = H * (0.3 + rand() * 0.4), r = 3 + rand() * 9;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(70,20,0,0.55)");
      g.addColorStop(0.6, "rgba(120,40,0,0.25)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    return cv;
  }

  /* =================== additive glow sprite =================== */
  function genGlow(hex, inner){
    const s = 256, c = mkCanvas(s, s), x = c.getContext("2d");
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    const gr = x.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
    gr.addColorStop(0,    "rgba(" + r + "," + g + "," + b + "," + inner + ")");
    gr.addColorStop(0.3,  "rgba(" + r + "," + g + "," + b + "," + (inner * 0.42) + ")");
    gr.addColorStop(0.62, "rgba(" + r + "," + g + "," + b + "," + (inner * 0.12) + ")");
    gr.addColorStop(1,    "rgba(0,0,0,0)");
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
    return c;
  }

  return { planet: genPlanet, clouds: genClouds, ring: genRing, moon: genMoon, sun: genSun, glow: genGlow };
})();
