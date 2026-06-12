"use strict";
/* =====================================================================
   app.js — camera rig, HUD, interactions, render loop
   ===================================================================== */

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- camera rig ---------------- */
const ctrl = {
  target: new THREE.Vector3(0, 0, 0), theta: 2.35, phi: 1.13, radius: 620,
  goal: { target: new THREE.Vector3(0, 0, 0), theta: 2.35, phi: 1.13, radius: 620 }
};
function applyCamera(){
  const t = ctrl.target;
  camera.position.set(
    t.x + ctrl.radius * Math.sin(ctrl.phi) * Math.cos(ctrl.theta),
    t.y + ctrl.radius * Math.cos(ctrl.phi),
    t.z + ctrl.radius * Math.sin(ctrl.phi) * Math.sin(ctrl.theta));
  camera.lookAt(t);
}

let dragging = false, px = 0, py = 0, pinchD = 0, moved = 0;
const cv = renderer.domElement;
cv.addEventListener("pointerdown", function(e){ dragging = true; moved = 0; px = e.clientX; py = e.clientY; });
addEventListener("pointerup", function(){ dragging = false; });
addEventListener("pointermove", function(e){
  if(!dragging) return;
  const dx = e.clientX - px, dy = e.clientY - py; px = e.clientX; py = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  ctrl.goal.theta += dx * 0.0045;
  ctrl.goal.phi = Math.min(2.7, Math.max(0.3, ctrl.goal.phi - dy * 0.0045));
});
cv.addEventListener("wheel", function(e){
  e.preventDefault();
  ctrl.goal.radius = Math.min(1600, Math.max(20, ctrl.goal.radius * (1 + e.deltaY * 0.0011)));
}, { passive: false });
cv.addEventListener("touchstart", function(e){
  if(e.touches.length === 2){
    pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }
}, { passive: true });
cv.addEventListener("touchmove", function(e){
  if(e.touches.length === 2){
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    ctrl.goal.radius = Math.min(1600, Math.max(20, ctrl.goal.radius * (pinchD / d)));
    pinchD = d;
  }
}, { passive: true });

/* ---------------- modes ---------------- */
let mode = "system", focused = -1;
const panel = document.getElementById("panel");
const board = document.getElementById("board");
const pager = document.getElementById("pager");
const legend = document.getElementById("legend");
const card = document.getElementById("card");
const about = document.getElementById("about");
document.getElementById("aboutBtn").addEventListener("click", function(){ about.classList.add("open"); });
document.getElementById("aboutX").addEventListener("click", function(){ about.classList.remove("open"); });
about.addEventListener("click", function(e){ if(e.target === about) about.classList.remove("open"); });
if(window.LIVE_INFO){
  const lastTh = document.querySelector("#panel th:last-child");
  if(lastTh) lastTh.textContent = "TOKENS";
}

PL.forEach(function(p, i){
  const d = document.createElement("div");
  d.className = "dot";
  d.addEventListener("click", function(){ focusPlanet(i); });
  pager.appendChild(d);
});
function refreshDots(){
  Array.prototype.forEach.call(pager.children, function(d, i){
    d.classList.toggle("active", i === focused && mode === "planet");
  });
}

/* optional brand logos — drop official assets at logos/<lab>.png */
const LOGO_OK = {};

function buildBoard(){
  board.innerHTML = "<h3>THE SYSTEM — LIVE SHARES</h3>";
  const max = Math.max.apply(null, LABS.map(function(l){ return l.share; }));
  LABS.forEach(function(l, i){
    const r = document.createElement("div"); r.className = "row";
    const c = "#" + l.color.toString(16).padStart(6, "0");
    const ic = LOGO_OK[l.name]
      ? '<img class="logo" src="' + LOGO_OK[l.name] + '" alt="">'
      : '<span class="sw" style="background:' + c + '"></span>';
    r.innerHTML = ic +
      '<span class="nm">' + l.name + '</span>' +
      '<span class="bar" style="background:' + c + ';width:' + (l.share / max * 70).toFixed(0) + 'px"></span>' +
      '<span class="val">' + l.share.toFixed(1) + '%</span>';
    r.addEventListener("click", function(){ focusPlanet(i); });
    board.appendChild(r);
  });
}
buildBoard();

/* probe which logo files exist
   (logos/google.png, logos/meta.png, logos/openai.png, logos/anthropic.png,
    logos/xai.png, logos/mistral.png, logos/alibaba.png, logos/deepseek.png) */
LABS.forEach(function(l, i){
  const src = "logos/" + l.name.toLowerCase() + ".png";
  const probe = new Image();
  probe.onload = function(){
    LOGO_OK[l.name] = src;
    PL[i].el.querySelector(".n").insertAdjacentHTML("afterbegin", '<img class="logo" src="' + src + '" alt="">');
    buildBoard();
    if(mode === "planet" && focused === i) fillPanel(i);
  };
  probe.src = src;
});

function fillPanel(i){
  const p = PL[i], lab = p.lab;
  const pLab = document.getElementById("pLab");
  pLab.innerHTML = (LOGO_OK[lab.name] ? '<img class="logo" src="' + LOGO_OK[lab.name] + '" alt=""> ' : "") + labDisplay(lab);
  pLab.style.color = "#" + lab.color.toString(16).padStart(6, "0");
  document.getElementById("pSub").textContent =
    "Est. " + lab.founded + "  ·  " + lab.share.toFixed(1) + "% of all tokens  ·  " +
    (lab.trend >= 0 ? "+" : "") + lab.trend.toFixed(1) + "% 24h";
  const rows = document.getElementById("pRows"); rows.innerHTML = "";
  lab.models.slice().sort(function(a, b){ return b.share - a.share; }).forEach(function(m){
    const tr = document.createElement("tr");
    tr.innerHTML = "<td>" + m.name + "</td><td>" + m.share.toFixed(1) + "%</td>" +
      '<td class="' + (m.trend >= 0 ? "up" : "down") + '">' + (m.trend >= 0 ? "+" : "") + m.trend.toFixed(1) + "%</td>" +
      "<td>" + (window.LIVE_INFO ? m.tok : m.released) + "</td>";
    rows.appendChild(tr);
  });
}

const wpF = new THREE.Vector3();
function focusPlanet(i){
  focused = i; mode = "planet";
  const p = PL[i];
  ctrl.goal.radius = Math.min(420, Math.max(26, p.extent * 3.1));
  ctrl.goal.phi = 1.18;
  /* land on the sunlit side: camera sits between the sun and the planet */
  p.posG.getWorldPosition(wpF);
  let th = Math.atan2(-wpF.z, -wpF.x);
  th += Math.round((ctrl.goal.theta - th) / (Math.PI * 2)) * Math.PI * 2;
  ctrl.goal.theta = th;
  fillPanel(i);
  panel.classList.remove("hidden");
  board.classList.add("hidden");
  card.style.display = "none";
  legend.textContent = window.LIVE_INFO
    ? "moon orbit = usage rank (innermost = most used)  ·  moon size = usage"
    : "moon orbit = release date (innermost = newest)  ·  moon size = usage";
  try{ history.replaceState(null, "", "#planet=" + encodeURIComponent(p.lab.name.toLowerCase())); }catch(err){}
  PL.forEach(function(q, qi){
    q.moonLineMats.forEach(function(m){ m.opacity = (qi === i) ? 0.22 : 0.05; });
  });
  refreshDots();
}
function systemView(){
  mode = "system"; focused = -1;
  ctrl.goal.target.set(0, 0, 0);
  ctrl.goal.radius = 620;
  ctrl.goal.phi = 1.13;
  panel.classList.add("hidden");
  board.classList.remove("hidden");
  card.style.display = "none";
  legend.textContent = "planet = AI lab  ·  planet size = usage  ·  moons = its models";
  try{ history.replaceState(null, "", location.pathname + location.search); }catch(err){}
  PL.forEach(function(q){ q.moonLineMats.forEach(function(m){ m.opacity = 0.07; }); });
  refreshDots();
}
document.getElementById("sysBtn").addEventListener("click", systemView);
document.getElementById("prev").addEventListener("click", function(){ focusPlanet((focused - 1 + PL.length) % PL.length); });
document.getElementById("next").addEventListener("click", function(){ focusPlanet((focused + 1) % PL.length); });
addEventListener("keydown", function(e){
  if(e.key === "Escape" && about.classList.contains("open")){ about.classList.remove("open"); return; }
  if(e.key === "ArrowLeft") focusPlanet((focused - 1 + PL.length) % PL.length);
  if(e.key === "ArrowRight") focusPlanet((focused + 1) % PL.length);
  if(e.key === "Escape" || e.key === "g") systemView();
});
let swX = 0, swT = 0, swY = 0;
cv.addEventListener("touchstart", function(e){
  if(e.touches.length === 1){ swX = e.touches[0].clientX; swY = e.touches[0].clientY; swT = Date.now(); }
}, { passive: true });
cv.addEventListener("touchend", function(e){
  const dx = e.changedTouches[0].clientX - swX, dy = e.changedTouches[0].clientY - swY;
  if(mode === "planet" && Date.now() - swT < 280 && Math.abs(dx) > 90 && Math.abs(dy) < 60){
    dx < 0 ? focusPlanet((focused + 1) % PL.length) : focusPlanet((focused - 1 + PL.length) % PL.length);
  }
}, { passive: true });

/* labels click → focus */
PL.forEach(function(p, i){
  p.el.addEventListener("click", function(){ focusPlanet(i); });
});

/* ---------------- raycast clicks ---------------- */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
const moonMeshes = [], planetMeshes = [];
PL.forEach(function(p){
  planetMeshes.push(p.mesh);
  p.moons.forEach(function(m){ moonMeshes.push(m.mesh); });
});
cv.addEventListener("click", function(e){
  if(moved > 8) return;
  ptr.x = (e.clientX / innerWidth) * 2 - 1;
  ptr.y = -(e.clientY / innerHeight) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hm = ray.intersectObjects(moonMeshes);
  if(hm.length){
    const u = hm[0].object.userData, m = u.model, lab = LABS[u.lab];
    if(mode !== "planet" || focused !== u.lab){ focusPlanet(u.lab); return; }
    document.getElementById("cT").textContent = m.name;
    document.getElementById("cS").textContent = lab.name;
    document.getElementById("cShare").textContent = m.share.toFixed(1) + "%";
    const tEl = document.getElementById("cTrend");
    tEl.textContent = (m.trend >= 0 ? "+" : "") + m.trend.toFixed(1) + "%";
    tEl.className = m.trend >= 0 ? "up" : "down";
    document.getElementById("cTok").textContent = m.tok;
    document.getElementById("cRel").textContent = m.released;
    card.style.display = "block";
    card.style.left = Math.min(innerWidth - 270, e.clientX + 16) + "px";
    card.style.top = Math.min(innerHeight - 220, e.clientY - 20) + "px";
    return;
  }
  const hp = ray.intersectObjects(planetMeshes);
  if(hp.length){ focusPlanet(hp[0].object.userData.lab); return; }
  const hs = ray.intersectObject(sunMesh);
  if(hs.length){ systemView(); return; }
  card.style.display = "none";
});

/* ---------------- live demo drift (demo mode only) ---------------- */
let tokens = window.LIVE_INFO ? window.LIVE_INFO.tokensToday : 2914381002118;
const TOK_RATE = window.LIVE_INFO ? window.LIVE_INFO.rate : 23300000;
const tokEl = document.getElementById("tok");
if(!window.LIVE_INFO) setInterval(function(){
  LABS.forEach(function(l){
    l.models.forEach(function(m){ m.share = Math.max(0.3, m.share + (Math.random() - 0.5) * 0.04); });
    l.share = l.models.reduce(function(a, m){ return a + m.share; }, 0);
  });
  buildBoard();
  if(mode === "planet") fillPanel(focused);
}, 4000);

/* ---------------- label projection ---------------- */
const v3 = new THREE.Vector3(), wp = new THREE.Vector3();
function projectLabel(el, worldPos, yOffsetPx, show){
  v3.copy(worldPos).project(camera);
  if(!show || v3.z > 1){ el.style.opacity = 0; el.style.pointerEvents = "none"; return; }
  el.style.opacity = 1; el.style.pointerEvents = "auto";
  el.style.left = ((v3.x * 0.5 + 0.5) * innerWidth) + "px";
  el.style.top = ((-v3.y * 0.5 + 0.5) * innerHeight + yOffsetPx) + "px";
}
function screenRadius(worldR, worldPos){
  const f = (innerHeight * 0.5) / Math.tan(camera.fov * 0.5 * Math.PI / 180);
  return worldR * f / Math.max(1, camera.position.distanceTo(worldPos));
}

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
let elapsed = 0;
function tick(){
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  ctrl.target.lerp(ctrl.goal.target, 1 - Math.pow(0.0018, dt));
  ctrl.radius += (ctrl.goal.radius - ctrl.radius) * (1 - Math.pow(0.0018, dt));
  ctrl.theta += (ctrl.goal.theta - ctrl.theta) * (1 - Math.pow(0.002, dt));
  ctrl.phi += (ctrl.goal.phi - ctrl.phi) * (1 - Math.pow(0.002, dt));
  if(mode === "system" && !dragging && !reduceMotion) ctrl.goal.theta += dt * 0.012;
  applyCamera();

  tokens += TOK_RATE * dt;
  tokEl.textContent = Math.floor(tokens).toLocaleString();

  /* sun */
  sunMesh.rotation.y += dt * 0.03;
  const pulse = 1 + (reduceMotion ? 0 : Math.sin(elapsed * 1.7) * 0.025);
  sunGlowA.scale.setScalar(SUN_R * 5.2 * pulse);
  sunGlowB.scale.setScalar(SUN_R * 13 * (2 - pulse));

  /* belt */
  if(!reduceMotion) beltGroup.rotation.y += dt * 0.006;

  PL.forEach(function(p, i){
    if(!reduceMotion || p.posG.position.lengthSq() === 0){
      p.angle += p.speed * dt;
      p.posG.position.set(Math.cos(p.angle) * p.orbitR, 0, Math.sin(p.angle) * p.orbitR);
    }
    p.mesh.rotation.y += dt * 0.10;
    if(p.cloudMesh) p.cloudMesh.rotation.y += dt * 0.135;

    /* planet size eases toward live share */
    const targetScale = (3 + p.lab.share * 0.30) / p.R;
    const s = p.mesh.scale.x + (targetScale - p.mesh.scale.x) * dt * 1.5;
    p.tiltG.scale.setScalar(s);

    p.moons.forEach(function(mo){
      if(!reduceMotion) mo.a += mo.speed * dt;
      mo.mesh.position.set(Math.cos(mo.a) * mo.orbitR, 0, Math.sin(mo.a) * mo.orbitR);
      mo.mesh.rotation.y += dt * 0.2;
      const mt = (0.5 + Math.sqrt(mo.m.share) * 0.55) / mo.r0;
      mo.mesh.scale.setScalar(mo.mesh.scale.x + (mt - mo.mesh.scale.x) * dt * 1.5);
    });

    /* camera follows the focused planet around its orbit */
    if(mode === "planet" && focused === i){
      p.posG.getWorldPosition(wp);
      ctrl.goal.target.copy(wp);
    }

    /* planet label below the limb */
    p.posG.getWorldPosition(wp);
    const sr = screenRadius(p.R * p.tiltG.scale.x, wp);
    projectLabel(p.el, wp, Math.min(170, sr + 22), true);
    p.el.querySelector(".shareTxt").textContent = p.lab.share.toFixed(1) + "%";
    const tt = p.el.querySelector(".trendTxt");
    tt.textContent = (p.lab.trend >= 0 ? "+" : "") + p.lab.trend.toFixed(1);
    tt.className = "trendTxt " + (p.lab.trend >= 0 ? "up" : "down");

    /* moon labels only when focused */
    const showM = (mode === "planet" && focused === i && ctrl.radius < p.extent * 6);
    p.moons.forEach(function(mo, mi){
      mo.mesh.getWorldPosition(wp);
      const msr = showM ? screenRadius(mo.r0 * mo.mesh.scale.x, wp) : 0;
      projectLabel(mo.label, wp, -(msr + 14), showM);
      if(showM) mo.label.querySelector(".v").textContent = p.sorted[mi].share.toFixed(1) + "%";
    });
  });

  renderer.render(scene, camera);
}

/* ---------------- boot: forge textures, then reveal ---------------- */
const loader = document.getElementById("loader");
const loadTxt = document.getElementById("loadTxt");
applyCamera();
tick();
runForge(
  function(name, k, total){ loadTxt.textContent = "FORGING WORLDS — " + name.toUpperCase() + " (" + (k + 1) + "/" + total + ")"; },
  function(){
    loader.classList.add("gone");
    legend.textContent = "planet = AI lab  ·  planet size = usage  ·  moons = its models";
    /* deep link: #planet=openai */
    const m = location.hash.match(/planet=([a-z0-9-]+)/i);
    if(m){
      const idx = PL.findIndex(function(p){ return p.lab.name.toLowerCase() === decodeURIComponent(m[1]).toLowerCase(); });
      if(idx >= 0) focusPlanet(idx);
    }
  }
);

addEventListener("resize", function(){
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
