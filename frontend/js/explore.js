window.Explore = {
    samplePage: 1,
    samplePages: 1,
    streak: parseInt(localStorage.getItem("wineStreak") || "0"),
    currentGameWine: null,
    
    init: async function() {
        let opts = App.features.map(f => `<option value="${f.name}">${esc(f.label)}</option>`).join("");
        $("xSelect").innerHTML = opts;
        $("ySelect").innerHTML = opts;
        $("xSelect").value = "alcohol";
        $("ySelect").value = "volatile_acidity";
        
        const updateScatter = () => this.renderScatter();
        $("xSelect").addEventListener("change", updateScatter);
        $("ySelect").addEventListener("change", updateScatter);
        
        $("prevPage").addEventListener("click", () => { if (this.samplePage > 1) { this.samplePage--; this.loadSamples(); } });
        $("nextPage").addEventListener("click", () => { if (this.samplePage < this.samplePages) { this.samplePage++; this.loadSamples(); } });
        
        $("browseAllDetails").addEventListener("toggle", (e) => {
           if (e.target.open && !this.samplesLoaded) {
               this.loadSamples();
           } 
        });
        
        $("btnNextWine").addEventListener("click", () => this.nextGameWine());
        
        document.querySelectorAll(".guess-btn").forEach(b => {
            b.addEventListener("click", () => this.makeGuess(Number(b.dataset.guess)));
        });
        
        $("gameStreak").textContent = this.streak;
    },
    
    render: async function() {
        this.renderScatter();
        this.renderCorr();
        if (!this.currentGameWine) this.nextGameWine();
    },
    
    renderScatter: async function() {
        const xF = $("xSelect").value;
        const yF = $("ySelect").value;
        
        let data;
        try { data = await api("/dataset/samples?page=1&per_page=500"); } catch(e) { return; }
        
        const points = data.rows.map(r => ({ x: r[xF], y: r[yF], q: r.quality }));
        
        const good = points.filter(p => p.q >= 6);
        const poor = points.filter(p => p.q < 6);
        
        if (App.charts.scatter) App.charts.scatter.destroy();
        App.charts.scatter = new Chart($("scatterChart"), {
            type: "scatter",
            data: {
                datasets: [
                    { label: "Good/Average (6+)", data: good, backgroundColor: "#6b7f5e" },
                    { label: "Poor (<6)", data: poor, backgroundColor: "#b3261e" }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { 
                    x: { title: { display: true, text: App.features.find(f => f.name === xF).label } },
                    y: { title: { display: true, text: App.features.find(f => f.name === yF).label } }
                }
            }
        });
    },
    
    renderCorr: function() {
        const sorted = [...App.features].sort((a, b) => b.corr_with_quality - a.corr_with_quality);
        if (App.charts.exploreCorr) App.charts.exploreCorr.destroy();
        App.charts.exploreCorr = new Chart($("corrChart2"), {
            type: "bar",
            data: {
              labels: sorted.map((f) => f.label),
              datasets: [{ data: sorted.map((f) => Number(f.corr_with_quality.toFixed(3))),
                backgroundColor: sorted.map((f) => (f.corr_with_quality >= 0 ? "#6b7f5e" : "#b3261e")), borderRadius: 4 }],
            },
            options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
        });
    },
    
    loadSamples: async function() {
      const d = await api(`/dataset/samples?page=${this.samplePage}&per_page=15`);
      this.samplesLoaded = true;
      this.samplePages = d.pages;
      $("pageInfo").textContent = `Page ${d.page} of ${d.pages} (${d.total} rows)`;
      $("prevPage").disabled = this.samplePage <= 1;
      $("nextPage").disabled = this.samplePage >= this.samplePages;
      const cols = App.features.map((f) => f.name);
      $("sampleTable").innerHTML =
        "<tr><th>ID</th>" + App.features.map((f) => `<th>${esc(f.label)}</th>`).join("") + "<th>Quality</th></tr>" +
        d.rows.map((r) => `<tr><td>${r.id}</td>` + cols.map((c) => `<td>${Number(r[c]).toFixed(3)}</td>`).join("") + `<td><b>${r.quality}</b></td></tr>`).join("");
    },
    
    nextGameWine: async function() {
        $("gameResult").classList.add("hidden");
        $("gameActions").style.display = "flex";
        try {
            const res = await api("/dataset/samples?page=" + Math.floor(Math.random()*100) + "&per_page=1");
            if (res.rows && res.rows.length) {
                this.currentGameWine = res.rows[0];
                let html = "<table>";
                const topF = [...App.features].sort((a, b) => Math.abs(b.corr_with_quality) - Math.abs(a.corr_with_quality)).slice(0, 6);
                for(let i=0; i<topF.length; i+=2) {
                    html += `<tr>
                        <td><b>${esc(topF[i].label)}</b>: ${Number(this.currentGameWine[topF[i].name]).toFixed(2)}</td>
                        <td>${topF[i+1] ? `<b>${esc(topF[i+1].label)}</b>: ${Number(this.currentGameWine[topF[i+1].name]).toFixed(2)}` : ''}</td>
                    </tr>`;
                }
                html += "</table>";
                $("gameStats").innerHTML = html;
            }
        } catch(e) {}
    },
    
    makeGuess: async function(guess) {
        if (!this.currentGameWine) return;
        const actual = this.currentGameWine.quality;
        
        let modelPred = "-";
        try {
            const mres = await api("/predict", { method: "POST", body: JSON.stringify(this.currentGameWine) });
            modelPred = mres.predicted_quality;
        } catch(e) {}
        
        $("gameActions").style.display = "none";
        const resBox = $("gameResult");
        resBox.classList.remove("hidden");
        
        if (guess === actual) {
            this.streak++;
            resBox.innerHTML = `<span style="color:var(--good)">Correct!</span> The quality was ${actual}. (Model guessed ${modelPred})`;
        } else {
            this.streak = 0;
            resBox.innerHTML = `<span style="color:var(--poor)">Wrong!</span> You guessed ${guess}, but it was ${actual}. (Model guessed ${modelPred})`;
        }
        localStorage.setItem("wineStreak", this.streak);
        $("gameStreak").textContent = this.streak;
    }
};
