"use strict";
/* =====================================================================
   build.js — scene assembly: star, planets, moons, rings, belt
   Globals consumed: THREE, LABS (data), TexGen (textures.js)
   Globals produced: scene, camera, renderer, PL, sunMesh, sunGlowA/B,
                     beltGroup, runForge()
   ===================================================================== */

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.5, 9000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x33405c, 1.05));
scene.add(new THREE.HemisphereLight(0x2c3650, 0x141a28, 0.5));
const sunLight = new THREE.PointLight(0xfff0d8, 1.12, 0, 2);
scene.add(sunLight);

const MAX_ANISO = Math.min(4, renderer.capabilities.getMaxAnisotropy());
function ct(canvas){
  const t = new THREE.CanvasTexture(canvas);
  t.anisotropy = MAX_ANISO;
  return t;
}

/* ---------------- starfield (two depth layers) ---------------- */
(function(){
  const n = 7500, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for(let i = 0; i < n; i++){
    const r = 1300 + Math.random() * 2800;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
    pos[i*3+1] = r * Math.cos(ph);
    pos[i*3+2] = r * Math.sin(ph) * Math.sin(th);
    const b = 0.35 + Math.pow(Math.random(), 2.2) * 0.65;
    if(Math.random() < 0.08){ col[i*3] = b; col[i*3+1] = b * 0.82; col[i*3+2] = b * 0.6; }   // warm giants
    else { col[i*3] = b * 0.88; col[i*3+1] = b * 0.93; col[i*3+2] = b; }                      // blue-white
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    size: 2.1, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false })));
})();

/* ---------------- the Sun = all tokens ---------------- */
const SUN_R = 30;
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_R, 48, 32),
  new THREE.MeshBasicMaterial({ color: 0xffa030 })
);
scene.add(sunMesh);
const sunGlowA = new THREE.Sprite(new THREE.SpriteMaterial({
  map: ct(TexGen.glow(0xffb84d, 0.95)), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
sunGlowA.scale.setScalar(SUN_R * 5.2);
scene.add(sunGlowA);
const sunGlowB = new THREE.Sprite(new THREE.SpriteMaterial({
  map: ct(TexGen.glow(0xff8c2a, 0.32)), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
sunGlowB.scale.setScalar(SUN_R * 13);
scene.add(sunGlowB);

/* ---------------- atmosphere shader ---------------- */
function atmosphere(R, hex){
  const mat = new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(hex) } },
    vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 c; varying vec3 vN; void main(){ float f = pow(max(0.0, 0.62 - dot(vN, vec3(0.0, 0.0, 1.0))), 3.0); gl_FragColor = vec4(c, f * 0.6); }",
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false
  });
  return new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, 40, 26), mat);
}

/* ---------------- ring mesh with radial UVs ---------------- */
function buildRing(inner, outer, tex){
  const geo = new THREE.RingGeometry(inner, outer, 96, 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for(let i = 0; i < pos.count; i++){
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex, side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: 0.95 }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/* ---------------- visual identity per lab ---------------- */
const STYLE = {
  "Google":    { type: "terra",    seed: 37,  atmo: 0x6fc3e8, tilt: 0.22, clouds: true, storm: true, ring: true },
  "Meta":      { type: "iceworld", seed: 67,  atmo: 0x7adcf0, tilt: 0.05 },
  "OpenAI":    { type: "gas",      seed: 11,  atmo: 0xa8d8a0, tilt: 0.10 },
  "Anthropic": { type: "desert",   seed: 23,  atmo: 0xe8a05c, tilt: 0.18 },
  "xAI":       { type: "rock",     seed: 79,  atmo: 0,        tilt: 0.02 },
  "Mistral":   { type: "venus",    seed: 113, atmo: 0xf0c878, tilt: 0.07 },
  "Alibaba":   { type: "gas2",     seed: 97,  atmo: 0xf2a8c8, tilt: 0.42, ring: true },
  "DeepSeek":  { type: "icegiant", seed: 53,  atmo: 0x9a7cff, tilt: 0.30 }
};
const ORBITS = [95, 125, 158, 192, 248, 274, 300, 326];

/* display name: Company + LLM family (skip duplicate, e.g. plain "Mistral") */
function labDisplay(lab){
  return (lab.planet && lab.planet !== lab.name) ? lab.name + " " + lab.planet : lab.name;
}

const labelsRoot = document.getElementById("labels");
const PL = [];
const seededRand = (function(){ let s = 4242; return function(){ s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

LABS.forEach(function(lab, i){
  const st = STYLE[lab.name];
  const orbitR = ORBITS[i];
  const R = 3 + lab.share * 0.30;

  const orbitPlane = new THREE.Group();
  orbitPlane.rotation.x = (seededRand() - 0.5) * 0.05;
  orbitPlane.rotation.z = (seededRand() - 0.5) * 0.05;
  scene.add(orbitPlane);

  /* orbit line */
  const pts = [];
  for(let k = 0; k <= 160; k++){
    const a = k / 160 * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * orbitR, 0, Math.sin(a) * orbitR));
  }
  orbitPlane.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x8a96b4, transparent: true, opacity: 0.13 })));

  const posG = new THREE.Group();
  orbitPlane.add(posG);
  const tiltG = new THREE.Group();
  tiltG.rotation.z = st.tilt;
  posG.add(tiltG);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(R, 56, 36),
    new THREE.MeshPhongMaterial({ color: 0x141b28, shininess: 10 }));
  mesh.userData = { type: "planet", lab: i };
  tiltG.add(mesh);

  let cloudMesh = null;
  if(st.clouds){
    cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.014, 48, 32),
      new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, opacity: 0.92 }));
    tiltG.add(cloudMesh);
  }
  if(st.atmo){
    tiltG.add(atmosphere(R, st.atmo));
  }

  /* moons — newest model = innermost orbit */
  const sorted = lab.models.slice().sort(function(a, b){ return b.released.localeCompare(a.released); });
  const moonLineMats = [];
  const moons = sorted.map(function(m, mi){
    const mr = 0.5 + Math.sqrt(m.share) * 0.55;
    const mOrbit = R + 4.5 + mi * 3.4;
    const mpts = [];
    for(let k = 0; k <= 80; k++){
      const a = k / 80 * Math.PI * 2;
      mpts.push(new THREE.Vector3(Math.cos(a) * mOrbit, 0, Math.sin(a) * mOrbit));
    }
    const lmat = new THREE.LineBasicMaterial({ color: 0x9aa6c4, transparent: true, opacity: 0.07 });
    moonLineMats.push(lmat);
    posG.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(mpts), lmat));

    const mm = new THREE.Mesh(
      new THREE.SphereGeometry(mr, 24, 16),
      new THREE.MeshPhongMaterial({ color: 0x202630, shininess: 5 }));
    mm.userData = { type: "moon", lab: i, model: m };
    posG.add(mm);

    const e = document.createElement("div");
    e.className = "lbl3d small";
    e.innerHTML = '<div class="n">' + m.name + '</div><div class="v"></div>';
    e.style.opacity = 0;
    labelsRoot.appendChild(e);

    return { mesh: mm, m: m, r0: mr, orbitR: mOrbit, a: seededRand() * Math.PI * 2,
             speed: 0.55 / Math.sqrt(mOrbit) * (0.8 + seededRand() * 0.4), label: e };
  });

  /* planet label */
  const hexCss = "#" + lab.color.toString(16).padStart(6, "0");
  const el = document.createElement("div");
  el.className = "lbl3d";
  el.innerHTML = '<div class="n" style="color:' + hexCss + '">' + labDisplay(lab) + '</div>' +
                 '<div class="v"><span class="shareTxt"></span> <span class="trendTxt"></span></div>';
  labelsRoot.appendChild(el);

  const extent = R + 4.5 + (sorted.length - 1) * 3.4 + 3;

  PL.push({ lab: lab, st: st, i: i, orbitPlane: orbitPlane, posG: posG, tiltG: tiltG,
            mesh: mesh, cloudMesh: cloudMesh, R: R, orbitR: orbitR,
            angle: seededRand() * Math.PI * 2, speed: 2.2 / Math.pow(orbitR, 1.18),
            moons: moons, moonLineMats: moonLineMats, el: el, sorted: sorted, extent: extent });
});

/* ---------------- asteroid belt between old guard & class of '23 ---------------- */
const beltGroup = new THREE.Group();
scene.add(beltGroup);
(function(){
  const COUNT = 650;
  const inst = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshPhongMaterial({ color: 0x837c70, shininess: 4, flatShading: true }),
    COUNT);
  const dummy = new THREE.Object3D();
  for(let k = 0; k < COUNT; k++){
    const a = seededRand() * Math.PI * 2;
    const r = 202 + seededRand() * 28 + (seededRand() - 0.5) * 8;
    dummy.position.set(Math.cos(a) * r, (seededRand() - 0.5) * 7, Math.sin(a) * r);
    dummy.rotation.set(seededRand() * 6.28, seededRand() * 6.28, seededRand() * 6.28);
    const s = 0.22 + Math.pow(seededRand(), 2.2) * 1.15;
    dummy.scale.set(s * (0.7 + seededRand() * 0.6), s, s * (0.7 + seededRand() * 0.6));
    dummy.updateMatrix();
    inst.setMatrixAt(k, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  beltGroup.add(inst);

  const n = 1600, pos = new Float32Array(n * 3);
  for(let i = 0; i < n; i++){
    const a = seededRand() * Math.PI * 2;
    const r = 200 + seededRand() * 34;
    pos[i*3] = Math.cos(a) * r; pos[i*3+1] = (seededRand() - 0.5) * 8; pos[i*3+2] = Math.sin(a) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  beltGroup.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0x8d94a8, size: 1.3, transparent: true, opacity: 0.4, depthWrite: false })));
})();

/* ---------------- async texture forge (keeps loader animating) ---------------- */
function runForge(onProgress, onDone){
  const tasks = [];

  tasks.push(["Igniting the sun", function(){
    sunMesh.material.map = ct(TexGen.sun());
    sunMesh.material.color.set(0xffffff);
    sunMesh.material.needsUpdate = true;
  }]);

  let moonTexes = [];
  tasks.push(["Carving the moons", function(){
    for(let k = 0; k < 4; k++) moonTexes.push(ct(TexGen.moon(500 + k * 37, false)));
    for(let k = 0; k < 2; k++) moonTexes.push(ct(TexGen.moon(900 + k * 53, true)));
  }]);

  PL.forEach(function(p){
    tasks.push([p.lab.name, function(){
      const t = TexGen.planet(p.st.type, p.st.seed, 768, 384);
      const mat = p.mesh.material;
      mat.map = ct(t.map);
      if(t.bump){ mat.bumpMap = ct(t.bump); mat.bumpScale = p.R * 0.045; }
      if(t.spec){
        mat.specularMap = ct(t.spec);
        mat.specular = new THREE.Color(0x223344);
        mat.shininess = 10;
      } else {
        mat.specular = new THREE.Color(0x1c1c1c);
        mat.shininess = 7;
      }
      mat.color.set(0xffffff);
      mat.needsUpdate = true;

      if(p.cloudMesh){
        p.cloudMesh.material.map = ct(TexGen.clouds(p.st.seed + 5, 512, 256, 0.52, p.st.storm));
        p.cloudMesh.material.needsUpdate = true;
      }
      if(p.st.ring){
        const ring = buildRing(p.R * 1.5, p.R * 2.45, ct(TexGen.ring(p.st.seed + 8, p.lab.color)));
        p.tiltG.add(ring);
        /* debris chunks in the ring plane (homage to the reference shot) */
        const nd = 240, dp = new Float32Array(nd * 3);
        for(let k = 0; k < nd; k++){
          const a = seededRand() * Math.PI * 2;
          const r = p.R * (1.5 + seededRand() * 0.95);
          dp[k*3] = Math.cos(a) * r; dp[k*3+1] = (seededRand() - 0.5) * 0.25; dp[k*3+2] = Math.sin(a) * r;
        }
        const dg = new THREE.BufferGeometry();
        dg.setAttribute("position", new THREE.BufferAttribute(dp, 3));
        p.tiltG.add(new THREE.Points(dg, new THREE.PointsMaterial({
          color: 0xd8dde8, size: 0.45, transparent: true, opacity: 0.75, depthWrite: false })));
      }
      p.moons.forEach(function(mo, mi){
        mo.mesh.material.map = moonTexes[(p.i * 3 + mi) % moonTexes.length];
        mo.mesh.material.color.set(0xffffff);
        mo.mesh.material.needsUpdate = true;
      });
    }]);
  });

  let k = 0;
  function step(){
    if(k >= tasks.length){ onDone(); return; }
    onProgress(tasks[k][0], k, tasks.length);
    /* yield a frame so the loader paints, then run the task */
    requestAnimationFrame(function(){
      tasks[k][1]();
      k++;
      step();
    });
  }
  step();
}
