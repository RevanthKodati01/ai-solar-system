"use strict";
/* =====================================================================
   live.js — OpenRouter live data adapter
   Fetches GET /api/v1/datasets/rankings-daily (official dataset API,
   auth: any OpenRouter API key) and rewrites LABS in place before the
   scene is built. Falls back silently to demo data on any failure.
   Citation requirement: "Source: OpenRouter (openrouter.ai/rankings)".
   ===================================================================== */
const LiveData = (function(){

  const AUTHOR_LAB = {
    "google": "Google", "meta-llama": "Meta", "openai": "OpenAI",
    "anthropic": "Anthropic", "x-ai": "xAI", "mistralai": "Mistral",
    "qwen": "Alibaba", "alibaba": "Alibaba", "deepseek": "DeepSeek"
  };

  function pretty(slug){
    const base = (slug.split("/")[1] || slug)
      .replace(/:.*$/, "")
      .replace(/-20\d{6}$/, "")    /* strip date-stamp suffixes like -20260217 */
      .replace(/-\d{4}-\d{2}-\d{2}$/, "");
    return base.split("-").map(function(w){
      if(/^gpt/i.test(w)) return w.toUpperCase();
      if(/^glm/i.test(w)) return w.toUpperCase();
      if(/^o\d/i.test(w)) return w.toLowerCase();
      if(/^v\d/i.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(" ");
  }

  function fmt(n){
    if(n >= 1e12) return (n / 1e12).toFixed(2) + "T";
    if(n >= 1e9)  return (n / 1e9).toFixed(0) + "B";
    return (n / 1e6).toFixed(0) + "M";
  }

  function getKey(){ try{ return localStorage.getItem("aiss_or_key") || ""; }catch(e){ return ""; } }
  function setKey(k){ try{ localStorage.setItem("aiss_or_key", k); }catch(e){} }

  function apply(rows, asOf){
    if(!Array.isArray(rows) || !rows.length) throw new Error("unexpected response shape");
    const dates = Array.from(new Set(rows.map(function(r){ return r.date; }))).sort();
    const last = dates[dates.length - 1], prev = dates[dates.length - 2];
    function dayMap(d){
      const m = {};
      rows.forEach(function(r){ if(r.date === d) m[r.model_permaslug] = Number(r.total_tokens) || 0; });
      return m;
    }
    const cur = dayMap(last), before = prev ? dayMap(prev) : {};
    const totalCur = Object.keys(cur).reduce(function(a, k){ return a + cur[k]; }, 0);
    const totalPrev = Object.keys(before).reduce(function(a, k){ return a + before[k]; }, 0) || totalCur;
    if(!totalCur) throw new Error("no token data");

    const byLab = {};
    Object.keys(cur).forEach(function(slug){
      if(slug === "other") return;
      const labName = AUTHOR_LAB[slug.split("/")[0]];
      if(!labName) return;
      (byLab[labName] = byLab[labName] || []).push({ slug: slug, tok: cur[slug], prevTok: before[slug] || 0 });
    });

    LABS.forEach(function(lab){
      /* include EVERY model of this lab that appears in OpenRouter's
         published dataset (top 50 models/day; smaller models are
         aggregated into "other" upstream and can't be attributed) */
      const list = (byLab[lab.name] || []).sort(function(a, b){ return b.tok - a.tok; });
      if(!list.length){
        lab.share = 0.2; lab.trend = 0;
        lab.models = [{ name: lab.planet, share: 0.2, trend: 0, released: "—", tok: "—" }];
        return;
      }
      lab.models = list.map(function(e){
        const share = e.tok / totalCur * 100;
        const prevShare = e.prevTok / totalPrev * 100;
        return { name: pretty(e.slug), share: share, trend: share - prevShare, released: "—", tok: fmt(e.tok) };
      });
      lab.share = lab.models.reduce(function(a, m){ return a + m.share; }, 0);
      lab.trend = lab.models.reduce(function(a, m){ return a + m.trend; }, 0);
    });

    window.LIVE_INFO = { tokensToday: totalCur, rate: totalCur / 86400, asOf: asOf || last };
    const tag = document.getElementById("demoTag");
    const stamp = (asOf || last).slice(0, 16).replace("T", " ");
    tag.textContent = "LIVE — Source: OpenRouter (openrouter.ai/rankings), as of " + stamp;
    tag.style.color = "#7fc89a";
    tag.style.borderColor = "rgba(127,200,154,.3)";
  }

  function init(){
    const proxy = (typeof window.DATA_PROXY_URL === "string" && window.DATA_PROXY_URL) || "";
    const key = getKey();
    if(!proxy && !key) return Promise.resolve(false);
    /* only ask for the last few days — we need today + yesterday for trends */
    const since = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const url = proxy || ("https://openrouter.ai/api/v1/datasets/rankings-daily?start_date=" + since);
    const opts = proxy ? {} : { headers: { "Authorization": "Bearer " + key } };
    return fetch(url, opts).then(function(res){
      if(!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function(json){
      apply(json.data || json.rows || json, json.meta && json.meta.as_of);
      return true;
    }).catch(function(err){
      console.warn("Live data unavailable — using demo data.", err);
      const tag = document.getElementById("demoTag");
      tag.textContent = "DEMO DATA — LIVE FETCH FAILED (" + err.message + ")";
      return false;
    });
  }

  function connectUI(){
    const tag = document.getElementById("demoTag");
    tag.style.cursor = "pointer";
    tag.title = "Click to connect / disconnect your OpenRouter API key (stored only in this browser)";
    tag.addEventListener("click", function(){
      const k = prompt(
        "Paste your OpenRouter API key for live data.\n" +
        "It is stored only in this browser (localStorage).\n" +
        "Leave empty + OK to disconnect.", getKey());
      if(k === null) return;
      setKey(k.trim());
      location.reload();
    });
  }

  return { init: init, connectUI: connectUI };
})();
