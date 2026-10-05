window.TasteLab = {
  currentValues: {},
  debounceTimer: null,
  
  init: function() {
      const groups = {
          "Acidity": ["fixed_acidity", "volatile_acidity", "citric_acid", "ph"],
          "Sweetness & Body": ["residual_sugar", "density", "alcohol"],
          "Preservatives & Salts": ["chlorides", "free_sulfur_dioxide", "total_sulfur_dioxide", "sulphates"]
      };
      
      let html = "";
      for (const [gname, fnames] of Object.entries(groups)) {
          html += `<div class="slider-group"><h3>${gname}</h3>`;
          fnames.forEach(name => {
              const f = App.features.find(x => x.name === name);
              if (!f) return;
              const step = f.max - f.min > 50 ? "1" : f.max - f.min > 5 ? "0.1" : "0.01";
              html += `<div class="slider-row">
                 <label>${esc(f.label)}</label>
                 <input type="range" id="sl_${f.name}" min="${f.min}" max="${f.max}" step="${step}" value="${f.mean}">
                 <div class="slider-val" id="val_${f.name}">${f.mean.toFixed(2)}</div>
              </div>`;
              this.currentValues[f.name] = f.mean;
          });
          html += `</div>`;
      }
      $("slidersForm").innerHTML = html;
      
      App.features.forEach(f => {
         const sl = $("sl_" + f.name);
         if (sl) {
             sl.addEventListener("input", (e) => {
                 $("val_" + f.name).textContent = Number(e.target.value).toFixed(2);
                 this.currentValues[f.name] = Number(e.target.value);
                 clearTimeout(this.debounceTimer);
                 this.debounceTimer = setTimeout(() => this.predict(), 300);
             });
         }
      });
      
      document.querySelectorAll(".preset-btn").forEach(b => {
         b.addEventListener("click", () => this.applyPreset(b.dataset.preset));
      });
      
      $("btnSuggest").addEventListener("click", () => this.suggest());
      $("btnSaveCellar").addEventListener("click", () => this.openSaveModal());
      
      this.predict();
  },
  
  render: function() {},
  
  applyPreset: async function(preset) {
      if (preset === "random") {
          try {
             const res = await api("/dataset/samples?page=" + Math.floor(Math.random()*100) + "&per_page=1");
             if (res.rows && res.rows.length) {
                 this.setValues(res.rows[0]);
             }
          } catch(e) {}
      } else if (preset === "average") {
          const vals = {};
          App.features.forEach(f => vals[f.name] = f.mean);
          this.setValues(vals);
      } else if (preset === "crisp") {
          const vals = {};
          App.features.forEach(f => vals[f.name] = f.mean);
          vals["fixed_acidity"] = 8.5;
          vals["citric_acid"] = 0.4;
          vals["residual_sugar"] = 1.2;
          vals["alcohol"] = 11.5;
          vals["ph"] = 3.1;
          this.setValues(vals);
      } else if (preset === "bold") {
          const vals = {};
          App.features.forEach(f => vals[f.name] = f.mean);
          vals["alcohol"] = 13.5;
          vals["residual_sugar"] = 3.0;
          vals["fixed_acidity"] = 9.5;
          vals["density"] = 0.998;
          this.setValues(vals);
      }
  },
  
  setValues: function(vals) {
      App.features.forEach(f => {
          if (vals[f.name] !== undefined) {
             const sl = $("sl_" + f.name);
             if (sl) {
                 sl.value = vals[f.name];
                 $("val_" + f.name).textContent = Number(vals[f.name]).toFixed(2);
                 this.currentValues[f.name] = Number(vals[f.name]);
             }
          }
      });
      this.predict();
  },
  
  predict: async function() {
      try {
          const r = await api("/predict", { method: "POST", body: JSON.stringify(this.currentValues) });
          this.lastPrediction = r;
          
          $("predScore").textContent = r.expected_quality.toFixed(1);
          $("predBadge").className = "badge " + r.category;
          $("predBadge").textContent = r.category + " Quality";
          
          let fillY = 90 - ((r.expected_quality - 3) / 5) * 60;
          fillY = Math.max(30, Math.min(90, fillY));
          if ($("glassFill")) $("glassFill").setAttribute("y", fillY);
          
          const probs = Object.entries(r.probabilities).sort((a,b)=>Number(a[0])-Number(b[0]));
          $("predProbs").innerHTML = probs.map(([q, p]) => 
             `<div class="bar-row"><span class="lbl">Score ${q}</span><div class="bar"><div style="width:${(p * 100).toFixed(1)}%"></div></div><span class="pct">${pct(p)}</span></div>`
          ).join("");
          
          $("suggestionsBox").classList.add("hidden");
      } catch (e) {
          console.error(e);
      }
  },
  
  suggest: async function() {
      const btn = $("btnSuggest");
      btn.disabled = true;
      btn.textContent = "Analyzing...";
      try {
          const suggestions = await api("/suggest", { method: "POST", body: JSON.stringify(this.currentValues) });
          const box = $("suggestionsBox");
          box.classList.remove("hidden");
          if (!suggestions.length) {
              box.innerHTML = `<p class="hint">Model can't find an easy way to improve this wine!</p>`;
          } else {
              box.innerHTML = `<p class="hint" style="margin-bottom:8px;">Try these changes to boost quality:</p>` + 
              suggestions.map(s => {
                  const f = App.features.find(x => x.name === s.feature);
                  return `<div style="background:#fff; border:1px solid var(--border); padding:10px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                     <div>
                       <div style="font-weight:600; font-size:13px; color:var(--text);">${s.direction === 'increasing' ? 'Raise' : 'Lower'} ${esc(f.label)}</div>
                       <div style="font-size:12px; color:var(--muted)">by ~${s.step_size.toFixed(2)}</div>
                     </div>
                     <button class="btn small ghost btn-apply-sugg" data-feat="${s.feature}" data-val="${s.new_value}" style="border-radius:12px; border-color:var(--wine-dark); color:var(--wine-dark); padding:6px 16px;">Apply</button>
                  </div>`;
              }).join("") +
              `<button class="btn big" id="btnApplyAllSugg" style="width:100%; margin-top:8px; background:var(--wine-dark);">Apply All</button>`;
              
              box.querySelectorAll(".btn-apply-sugg").forEach(b => {
                 b.addEventListener("click", () => {
                     const vals = { ...this.currentValues };
                     vals[b.dataset.feat] = Number(b.dataset.val);
                     this.setValues(vals);
                 });
              });
              
              $("btnApplyAllSugg").addEventListener("click", () => {
                 const vals = { ...this.currentValues };
                 suggestions.forEach(s => {
                     vals[s.feature] = Number(s.new_value);
                 });
                 this.setValues(vals);
              });
          }
      } catch (e) {
          toast(e.message, true);
      } finally {
          btn.disabled = false;
          btn.textContent = "How to improve this wine?";
      }
  },
  
  openSaveModal: function() {
      if (!this.lastPrediction) { toast("Please wait for prediction.", true); return; }
      $("cName").value = "My Blend " + Math.floor(Math.random() * 1000);
      $("cVintage").value = new Date().getFullYear();
      $("cRating").value = "";
      $("cNotes").value = "";
      $("cellarModal").showModal();
  }
};

$("btnCancelCellar").addEventListener("click", () => $("cellarModal").close());
$("btnSaveCellarConfirm").addEventListener("click", async () => {
    const data = { ...TasteLab.currentValues };
    data.name = $("cName").value || "Unnamed";
    data.vintage = $("cVintage").value;
    data.user_rating = $("cRating").value ? Number($("cRating").value) : null;
    data.notes = $("cNotes").value;
    data.predicted_quality = TasteLab.lastPrediction ? TasteLab.lastPrediction.predicted_quality : 5;
    
    try {
        await api("/cellar", { method: "POST", body: JSON.stringify(data) });
        $("cellarModal").close();
        toast("Saved to My Cellar!");
        if (window.Cellar) Cellar.loaded = false;
    } catch (e) {
        toast(e.message, true);
    }
});
