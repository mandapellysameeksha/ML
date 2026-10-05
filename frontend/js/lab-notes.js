window.LabNotes = {
    render: function() {
        if (!App.model) return;
        const m = App.model;
        
        $("labMetrics").innerHTML = `
          <div class="card"><div class="label">Accuracy</div><div class="value">${pct(m.accuracy)}</div></div>
          <div class="card"><div class="label">Precision</div><div class="value">${pct(m.precision_w)}</div></div>
          <div class="card"><div class="label">Recall</div><div class="value">${pct(m.recall_w)}</div></div>
          <div class="card"><div class="label">F1 Score</div><div class="value">${pct(m.f1_w)}</div></div>
        `;
        
        if (App.charts.labPerm) App.charts.labPerm.destroy();
        const top = [...m.importances].sort((a,b) => b.permutation - a.permutation).slice(0, 10);
        App.charts.labPerm = new Chart($("labPermChart"), {
          type: "bar",
          data: {
              labels: top.map(r => App.features.find(f => f.name === r.feature).label),
              datasets: [{ data: top.map(r => r.permutation), backgroundColor: "#8b5e3c", borderRadius: 4 }]
          },
          options: { indexAxis: "y", plugins: { legend: { display: false } } }
        });
        
        const { labels, confusion } = m;
        let chtml = "<table><tr><th>Actual \\ Pred</th>" + labels.map((l) => `<th>${l}</th>`).join("") + "</tr>";
        confusion.forEach((row, i) => {
          chtml += `<tr><td><b>${labels[i]}</b></td>` + row.map((v, j) =>
            `<td style="${i===j ? 'background:#e3f1e8; font-weight:bold;' : ''}">${v}</td>`).join("") + "</tr>";
        });
        $("confMatrix").innerHTML = chtml + "</table>";
        
        const rows = m.history || [];
        $("runTable").innerHTML =
          "<tr><th>ID</th><th>Time</th><th>Trees</th><th>Test%</th><th>Train Rows</th><th>Accuracy</th><th>F1</th></tr>" +
          rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.created_at)}</td><td>${r.n_estimators}</td><td>${r.test_fraction || '-'}</td><td>${r.train_rows || '-'}</td><td>${pct(r.accuracy)}</td><td>${pct(r.f1_w)}</td></tr>`).join("");
    }
};

$("retrainBtn").addEventListener("click", async () => {
  const btn = $("retrainBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Fermenting...';
  try {
    const newData = await api("/model/train", {
      method: "POST",
      body: JSON.stringify({ 
          n_estimators: Number($("trees").value), 
          test_fraction: Number($("testFrac").value),
          include_user_wines: $("includeUserWines").checked
      }),
    });
    App.model = newData;
    LabNotes.render();
    if ($("home").classList.contains("active") && window.Home) Home.render();
    toast("New model trained successfully!");
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Ferment new model";
  }
});
