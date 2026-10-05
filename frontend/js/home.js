window.Home = {
  render: function() {
    if (!App.model || !App.datasetSummary) return;
    const m = App.model;
    const topFeature = m.importances.length ? App.features.find(f => f.name === m.importances[0].feature).label : "Alcohol";
    
    $("homeStats").innerHTML = `
      <div class="card"><div class="label">Wines Studied</div><div class="value">1,599</div></div>
      <div class="card"><div class="label">Model accuracy</div><div class="value">${pct(m.accuracy)}</div><div class="sub">Right about ${Math.round(m.accuracy*100)}% of the time</div></div>
      <div class="card"><div class="label">Biggest driver</div><div class="value" style="font-size:24px; padding-top:6px;">${esc(topFeature)}</div><div class="sub">Has the most impact on quality</div></div>
    `;

    const top = m.importances.slice(0, 5);
    let html = "";
    top.forEach(imp => {
       const f = App.features.find(x => x.name === imp.feature);
       const w = (imp.permutation / top[0].permutation) * 100;
       html += `<div style="margin-bottom:12px;">
           <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:600; font-size:14px;">
              <span>${esc(f.label)}</span>
           </div>
           <div class="bar" style="height:12px; background:#eadfe2; border-radius:6px; overflow:hidden;">
              <div style="width:${Math.max(2, w)}%; background:var(--wine); height:100%;"></div>
           </div>
           <p style="font-size:12px; color:var(--muted); margin:4px 0 0 0;">${f.corr_with_quality > 0 ? 'Higher amounts tend to mean better quality.' : 'Higher amounts tend to mean lower quality.'}</p>
       </div>`;
    });
    $("homeImportantFeatures").innerHTML = html;
    
    if ($("showTechDetails").checked) {
        this.renderCharts();
    }
  },
  
  renderCharts: function() {
      if (!window.Chart || !App.model) return;
      const m = App.model;
      
      if (App.charts.homeGini) App.charts.homeGini.destroy();
      const top = m.importances.slice(0, 5);
      App.charts.homeGini = new Chart($("homeTechGini"), {
        type: "bar",
        data: {
            labels: top.map(r => App.features.find(f => f.name === r.feature).label),
            datasets: [{ data: top.map(r => r.gini), backgroundColor: "#722f37", borderRadius: 4 }]
        },
        options: { indexAxis: "y", plugins: { legend: { display: false } } }
      });
      
      const { labels, confusion } = m;
      let chtml = "<table><tr><th>Actual \\ Pred</th>" + labels.map((l) => `<th>${l}</th>`).join("") + "</tr>";
      confusion.forEach((row, i) => {
        chtml += `<tr><td><b>${labels[i]}</b></td>` + row.map((v, j) =>
          `<td style="${i===j ? 'background:#e3f1e8; font-weight:bold;' : ''}">${v}</td>`).join("") + "</tr>";
      });
      $("homeTechConf").innerHTML = chtml + "</table>";
  }
};
