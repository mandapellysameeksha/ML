window.Cellar = {
  loaded: false,
  items: [],
  selectedForCompare: new Set(),
  
  load: async function() {
      if (this.loaded) return;
      try {
          this.items = await api("/cellar");
          this.loaded = true;
          this.render();
      } catch(e) {
          toast(e.message, true);
      }
  },
  
  render: function() {
      const grid = $("cellarGrid");
      if (!this.items.length) {
          grid.style.display = "none";
          $("cellarEmpty").style.display = "block";
          $("btnExport").disabled = true;
          return;
      }
      grid.style.display = "grid";
      $("cellarEmpty").style.display = "none";
      $("btnExport").disabled = false;
      
      let html = "";
      this.items.forEach(w => {
         const agrees = w.user_rating ? (w.user_rating === w.predicted_quality) : null;
         let badgeHtml = "";
         if (agrees !== null) {
             badgeHtml = `<div class="predicted" style="background:${agrees ? 'var(--good)' : 'var(--poor)'}; color:#fff;">Model ${agrees ? 'agrees' : 'disagrees'} (${w.predicted_quality})</div>`;
         } else {
             badgeHtml = `<div class="predicted">Predicted: ${w.predicted_quality}</div>`;
         }
         
         const isSel = this.selectedForCompare.has(w.id);
         
         html += `<div class="wine-card" style="${isSel ? 'border-color:var(--wine); box-shadow:0 0 0 2px var(--wine);' : ''}">
            <h3>${esc(w.name)}</h3>
            ${w.vintage ? `<div class="vintage">${esc(w.vintage)}</div>` : ''}
            <div class="rating">${'★'.repeat(w.user_rating || 0)}${'☆'.repeat(5 - (w.user_rating || 0))}</div>
            ${badgeHtml}
            ${w.notes ? `<p style="font-size:13px; color:var(--muted); font-style:italic; margin-top:12px;">"${esc(w.notes)}"</p>` : ''}
            <div class="actions">
               <button class="btn small ghost btn-cellar-load" data-id="${w.id}">Taste Again</button>
               <button class="btn small ${isSel ? '' : 'ghost'} btn-cellar-comp" data-id="${w.id}">${isSel ? 'Selected' : 'Compare'}</button>
               <button class="btn small ghost btn-cellar-del" data-id="${w.id}" style="color:var(--poor); border-color:var(--poor);">Del</button>
            </div>
         </div>`;
      });
      grid.innerHTML = html;
      
      grid.querySelectorAll(".btn-cellar-load").forEach(b => {
          b.addEventListener("click", () => {
             const w = this.items.find(x => x.id == b.dataset.id);
             TasteLab.setValues(w);
             showTab("taste-lab");
          });
      });
      
      grid.querySelectorAll(".btn-cellar-del").forEach(b => {
          b.addEventListener("click", async () => {
             if(confirm("Delete this wine?")) {
                 await api("/cellar/" + b.dataset.id, { method: "DELETE" });
                 this.selectedForCompare.delete(Number(b.dataset.id));
                 this.loaded = false;
                 this.load();
                 this.updateCompareBtn();
             }
          });
      });
      
      grid.querySelectorAll(".btn-cellar-comp").forEach(b => {
          b.addEventListener("click", () => {
             const id = Number(b.dataset.id);
             if (this.selectedForCompare.has(id)) {
                 this.selectedForCompare.delete(id);
             } else {
                 if (this.selectedForCompare.size >= 2) {
                     toast("You can only compare 2 wines at a time.", true);
                     return;
                 }
                 this.selectedForCompare.add(id);
             }
             this.updateCompareBtn();
             this.render();
          });
      });
  },
  
  updateCompareBtn: function() {
      const btn = $("btnCompare");
      btn.textContent = `Compare Selected (${this.selectedForCompare.size})`;
      btn.disabled = this.selectedForCompare.size !== 2;
  },
  
  compare: function() {
      const arr = Array.from(this.selectedForCompare).map(id => this.items.find(x => x.id === id));
      if (arr.length !== 2) return;
      
      $("compareView").classList.remove("hidden");
      if (App.charts.compare) App.charts.compare.destroy();
      
      const labels = App.features.map(f => f.label);
      const data1 = App.features.map(f => (arr[0][f.name] - f.min) / (f.max - f.min) * 100);
      const data2 = App.features.map(f => (arr[1][f.name] - f.min) / (f.max - f.min) * 100);
      
      App.charts.compare = new Chart($("compareChart"), {
          type: "radar",
          data: {
              labels: labels,
              datasets: [
                  { label: arr[0].name, data: data1, backgroundColor: "rgba(91, 26, 44, 0.2)", borderColor: "#5b1a2c", pointBackgroundColor: "#5b1a2c" },
                  { label: arr[1].name, data: data2, backgroundColor: "rgba(201, 162, 75, 0.2)", borderColor: "#c9a24b", pointBackgroundColor: "#c9a24b" }
              ]
          },
          options: {
              responsive: true, maintainAspectRatio: false,
              scales: { r: { ticks: { display: false } } },
              plugins: { tooltip: { callbacks: { label: function(context) { return context.dataset.label; } } } }
          }
      });
  }
};

$("btnExport").addEventListener("click", () => {
    window.open(API + "/cellar/export", "_blank");
});
$("btnCompare").addEventListener("click", () => Cellar.compare());
$("btnCloseCompare").addEventListener("click", () => $("compareView").classList.add("hidden"));
