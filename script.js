
// 1. Initialize Supabase Connection
const SUPABASE_URL = 'https://jwuzpwglpqkohecxkeuf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3dXpwd2dscHFrb2hlY3hrZXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTQ3NTksImV4cCI6MjA5NjkzMDc1OX0.VGST1zYSae2-BHGoq2jXH7qOrPqMHCqR7atibbpd1f8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let chart;
let vehiclesData = [];
let statesData = [];
let tradeInDatabase = {};
let currentSpreadsheetVehicle = null;
let isManualValuationMode = false;
let isMonthlyFreq = false;

window.onload = async () => {
    try {
        const { data: states } = await db.from('states').select('*');
        if (states) statesData = states;

        const { data: vehicles } = await db.from('vehicles').select('*');
        if (vehicles) vehiclesData = vehicles;

        const { data: resale } = await db.from('resale_value').select('*');
        if (resale) {
            resale.forEach(row => {
                if (!tradeInDatabase[row.make]) tradeInDatabase[row.make] = {};
                if (!tradeInDatabase[row.make][row.model]) tradeInDatabase[row.make][row.model] = {};
                tradeInDatabase[row.make][row.model][row.year] = { 
                    baseValue: row.base_resale_value, 
                    penalty: row.per_km_depreciation_penalty 
                };
            });
            populateMakes();
        }
        populateCoreDropdowns();
    } catch (err) {
        console.error("Database connection error:", err);
    }
};

function populateCoreDropdowns() {
    const vSelect = document.getElementById('vehicleSelect');
    const sSelect = document.getElementById('stateSelect');
    
    vSelect.innerHTML = '<option value="" disabled>Select an eSUV variant...</option>';
    sSelect.innerHTML = '<option value="" disabled>Select state...</option>';
    
    const groupedVehicles = {};
    vehiclesData.forEach(v => {
        if(!groupedVehicles[v.product_name]) groupedVehicles[v.product_name] = [];
        groupedVehicles[v.product_name].push(v);
    });

    for (const group in groupedVehicles) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group;
        groupedVehicles[group].forEach(v => {
            const option = document.createElement('option');
            option.value = JSON.stringify(v);
            option.innerText = v.product_variant;
            optgroup.appendChild(option);
        });
        vSelect.appendChild(optgroup);
    }
    
    statesData.forEach(s => {
        const option = document.createElement('option');
        option.value = JSON.stringify(s);
        option.innerText = s.state_name;
        sSelect.appendChild(option);
    });

    const defaultStateIndex = Array.from(sSelect.options).findIndex(opt => opt.innerText.includes("Maharashtra"));
    if (defaultStateIndex > -1) sSelect.selectedIndex = defaultStateIndex;

    const defaultVehIndex = Array.from(vSelect.options).findIndex(opt => opt.innerText.includes("XEV 9e Pack Three 79"));
    if (defaultVehIndex > -1) vSelect.selectedIndex = defaultVehIndex;

    handleVehicleChange();
    
    // Set initial display format for raw inputs
    handleCurrencyBlur('odometerInput', false);
    handleCurrencyBlur('manualExchangeInput', false);
    handleCurrencyBlur('downPaymentInput', false);
}

function toggleFrequency() {
    isMonthlyFreq = !isMonthlyFreq;
    const btn = document.getElementById('freqToggleBtn');
    btn.innerText = isMonthlyFreq ? 'monthly' : 'weekly';
    const distInput = document.getElementById('distanceNum');
    distInput.value = isMonthlyFreq ? 1500 : 400;
    updateCalculations();
}

function adjustDistance(direction) {
    const distInput = document.getElementById('distanceNum');
    let current = parseInt(distInput.value) || 0;
    const step = isMonthlyFreq ? 100 : 50;
    current += (step * direction);
    if (current < 0) current = 0;
    distInput.value = current;
    updateCalculations();
}

function selectFuelType(type) {
    document.getElementById('cardDiesel').classList.toggle('selected', type === 'diesel');
    document.getElementById('cardPetrol').classList.toggle('selected', type === 'petrol');
    document.querySelector(`input[name="fuelType"][value="${type}"]`).checked = true;
    document.getElementById('lblSpreadsheetIcePrice').innerText = type === 'petrol' ? 'Petrol Ex-Sh' : 'Diesel Ex-Sh';
    handleVehicleChange();
}

function handleRouteSplitChange() {
    const highway = document.getElementById('routeSplitSlider').value;
    document.getElementById('cityLabel').innerText = `City: ${100 - highway}%`;
    document.getElementById('highwayLabel').innerText = `Highway: ${highway}%`;
    updateCalculations();
}

function toggleBusinessSection() {
    const isChecked = document.getElementById('businessPurchaseCheck').checked;
    document.getElementById('corporateTaxContainer').classList.toggle('hidden', !isChecked);
    document.getElementById('rowCorporateTax').classList.toggle('hidden', !isChecked);
    document.getElementById('proTipBox').classList.toggle('hidden', !isChecked);
    updateCalculations();
}

function toggleExchangeSection() {
    const isChecked = document.getElementById('exchangeCheck').checked;
    document.getElementById('exchangeSection').classList.toggle('hidden', !isChecked);
    updateCalculations();
}

function toggleValuationPath() {
    isManualValuationMode = !isManualValuationMode;
    document.getElementById('dropdownsContainer').classList.toggle('hidden', isManualValuationMode);
    
    const textNode = document.getElementById('exchangeValueText');
    const inputWrapper = document.getElementById('manualExchangeWrapper');
    
    if (isManualValuationMode) {
        textNode.classList.add('hidden');
        inputWrapper.classList.remove('hidden');
        document.getElementById('fallbackToggleBtn').innerText = "Use guided vehicle list selection";
    } else {
        textNode.classList.remove('hidden');
        inputWrapper.classList.add('hidden');
        document.getElementById('fallbackToggleBtn').innerText = "Can't find your car listed? Enter manually";
    }
    updateCalculations();
}

function toggleAssumptions() {
    document.getElementById('baselineAccordion').classList.toggle('hidden');
}

// FORMATTERS & STEPPERS
function formatToLakhsString(number) {
    return "₹ " + (number / 100000).toFixed(2) + " L";
}
function formatEnIn(number) {
    return "₹ " + parseInt(number).toLocaleString('en-IN');
}

function handleCurrencyFocus(inputId, useRs = true) {
    const display = document.getElementById(inputId + 'Display');
    const hidden = document.getElementById(inputId);
    display.type = 'number';
    display.value = hidden.value;
}

function handleCurrencyBlur(inputId, useRs = true) {
    const display = document.getElementById(inputId + 'Display');
    const hidden = document.getElementById(inputId);
    display.type = 'text';
    display.value = useRs ? formatEnIn(hidden.value) : parseInt(hidden.value).toLocaleString('en-IN');
}

function handleCurrencyInput(inputId, useRs = true) {
    const display = document.getElementById(inputId + 'Display');
    const hidden = document.getElementById(inputId);
    // Strips commas and non-numeric chars so user can type freely
    const rawVal = display.value.replace(/[^0-9]/g, '');
    hidden.value = rawVal || 0;
    updateCalculations();
}

function adjustCurrencyStepper(inputId, amount, useRs = true) {
    const hidden = document.getElementById(inputId);
    let val = parseInt(hidden.value) || 0;
    val += amount;
    if (val < 0) val = 0;
    hidden.value = val;
    handleCurrencyBlur(inputId, useRs);
    updateCalculations();
}

// DATA PIPELINES
function handleVehicleChange() {
    const selectEl = document.getElementById('vehicleSelect');
    if (!selectEl.value) return;
    
    currentSpreadsheetVehicle = JSON.parse(selectEl.value);
    const fuelType = document.querySelector('input[name="fuelType"]:checked').value;
    const iceExSh = fuelType === 'petrol' ? currentSpreadsheetVehicle.petrol_exsh_comp : currentSpreadsheetVehicle.diesel_exsh_comp;
    
    document.getElementById('overrideIceExPrice').value = iceExSh;
    document.getElementById('overrideEvExPrice').value = currentSpreadsheetVehicle.ex_showroom_ev;
    
    handleCurrencyBlur('overrideIceExPrice');
    handleCurrencyBlur('overrideEvExPrice');
    
    updateCalculations();
}

function populateMakes() {
    const makeSelect = document.getElementById('makeSelect');
    makeSelect.innerHTML = '<option value="">Select Make</option>';
    Object.keys(tradeInDatabase).forEach(make => {
        let opt = document.createElement('option'); opt.value = make; opt.innerText = make;
        makeSelect.appendChild(opt);
    });
}
function updateModels() {
    const make = document.getElementById('makeSelect').value;
    const modelSelect = document.getElementById('modelSelect');
    modelSelect.innerHTML = '<option value="">Select Model</option>';
    document.getElementById('yearSelect').innerHTML = '<option value="">Year</option>';
    if(make && tradeInDatabase[make]) {
        Object.keys(tradeInDatabase[make]).forEach(model => {
            let opt = document.createElement('option'); opt.value = model; opt.innerText = model;
            modelSelect.appendChild(opt);
        });
    }
    updateCalculations();
}
function updateYears() {
    const make = document.getElementById('makeSelect').value;
    const model = document.getElementById('modelSelect').value;
    const yearSelect = document.getElementById('yearSelect');
    yearSelect.innerHTML = '<option value="">Year</option>';
    if(make && model && tradeInDatabase[make][model]) {
        Object.keys(tradeInDatabase[make][model]).forEach(year => {
            let opt = document.createElement('option'); opt.value = year; opt.innerText = year;
            yearSelect.appendChild(opt);
        });
    }
    updateCalculations();
}

// CORE ENGINE
function updateCalculations() {
    if (!currentSpreadsheetVehicle) return;
    
    const stateObj = document.getElementById('stateSelect').value ? JSON.parse(document.getElementById('stateSelect').value) : {overhead_multiplier_ice: 0.20, overhead_multiplier_ev: 0.05};
    
    const distance = parseFloat(document.getElementById('distanceNum').value) || 0;
    const annualMileage = isMonthlyFreq ? distance * 12 : distance * 52;
    const highwaySplit = parseFloat(document.getElementById('routeSplitSlider').value) / 100;
    const citySplit = 1 - highwaySplit;
    
    const fuelType = document.querySelector('input[name="fuelType"]:checked').value;
    const isPetrol = (fuelType === 'petrol');
    
    const iceExShowroom = parseFloat(document.getElementById('overrideIceExPrice').value) || 0;
    const evExShowroom = parseFloat(document.getElementById('overrideEvExPrice').value) || 0;
    
    const petrolPrice = parseFloat(document.getElementById('varPetrolPrice').value);
    const dieselPrice = parseFloat(document.getElementById('varDieselPrice').value);
    const homeCharge = parseFloat(document.getElementById('varHomeCharge').value);
    const publicCharge = parseFloat(document.getElementById('varPublicCharge').value);
    
    const iceEff = isPetrol ? parseFloat(document.getElementById('varPetrolEff').value) : parseFloat(document.getElementById('varDieselEff').value);
    const evEff = parseFloat(document.getElementById('varEvEff').value);
    
    let tempEvSvcRate = parseFloat(document.getElementById('varEvSvc').value);
    let tempIceSvcRate = isPetrol ? parseFloat(document.getElementById('varPetrolSvc').value) : parseFloat(document.getElementById('varDieselSvc').value);

    const blendedUnitCost = (citySplit * homeCharge) + (highwaySplit * publicCharge);
    const iceCostPerKm = (isPetrol ? petrolPrice : dieselPrice) / iceEff;
    const evCostPerKm = blendedUnitCost / evEff;

    const iceTaxAmt = iceExShowroom * stateObj.overhead_multiplier_ice;
    const evTaxAmt = evExShowroom * stateObj.overhead_multiplier_ev;
    
    let iceCumulative = iceExShowroom + iceTaxAmt;
    let evCumulative = evExShowroom + evTaxAmt;

    const isBusiness = document.getElementById('businessPurchaseCheck').checked;
    const corpTaxRate = parseFloat(document.getElementById('corporateTaxRate').value) / 100;
    let iceWdv = iceExShowroom;
    let evWdv = evExShowroom;
    let totalCorpTaxSaved = 0;

    let timeline = [];
    
    timeline.push({ label: "Ex-sh.", ice: iceExShowroom, ev: evExShowroom, isCumulativeCost: false, isSeparator: false });
    timeline.push({ label: "Road Tax, Ins. & other charges", ice: iceTaxAmt, ev: evTaxAmt, isCumulativeCost: false, isSeparator: false });
    timeline.push({ label: "Day 0 Upfront Cost", ice: iceCumulative, ev: evCumulative, isCumulativeCost: true, isSeparator: true });

    let totalIceFuelSpent = 0; let totalEvEnergySpent = 0;
    let totalIceSvcSpent = 0; let totalEvSvcSpent = 0;
    let breakevenYear = null;

    for (let year = 1; year <= 7; year++) {
        let yrIceFuel = annualMileage * iceCostPerKm;
        let yrEvEnergy = annualMileage * evCostPerKm;
        
        let yrIceSvc = annualMileage * tempIceSvcRate;
        let yrEvSvc = annualMileage * tempEvSvcRate;
        
        totalIceFuelSpent += yrIceFuel;
        totalEvEnergySpent += yrEvEnergy;
        totalIceSvcSpent += yrIceSvc;
        totalEvSvcSpent += yrEvSvc;
        
        iceCumulative += (yrIceFuel + yrIceSvc);
        evCumulative += (yrEvEnergy + yrEvSvc);

        let yearTaxNoteIce = "";
        let yearTaxNoteEv = "";
        
        if (isBusiness) {
            let iceDepreciation = iceWdv * 0.15;
            let evDepreciation = evWdv * 0.40;
            
            let iceTaxShield = iceDepreciation * corpTaxRate;
            let evTaxShield = evDepreciation * corpTaxRate;
            
            iceCumulative -= iceTaxShield;
            evCumulative -= evTaxShield;
            
            totalCorpTaxSaved += (evTaxShield - iceTaxShield);
            
            iceWdv -= iceDepreciation;
            evWdv -= evDepreciation;
            
            yearTaxNoteIce = `<br><span class="tax-hint">(incl. ${formatToLakhsString(iceTaxShield)} Tax Saved)</span>`;
            yearTaxNoteEv = `<br><span class="tax-hint">(incl. ${formatToLakhsString(evTaxShield)} Tax Saved)</span>`;
        }

        tempEvSvcRate *= 1.05;
        tempIceSvcRate *= 1.20;

        if (evCumulative <= iceCumulative && breakevenYear === null) {
            let prevYearIce = iceCumulative - (yrIceFuel + yrIceSvc) + (isBusiness ? (iceWdv/0.85)*0.15*corpTaxRate : 0);
            let prevYearEv = evCumulative - (yrEvEnergy + yrEvSvc) + (isBusiness ? (evWdv/0.60)*0.40*corpTaxRate : 0);
            let prevDiff = prevYearEv - prevYearIce;
            let catchupRate = (iceCumulative - prevYearIce) - (evCumulative - prevYearEv);
            breakevenYear = (year - 1) + Math.abs(prevDiff / catchupRate);
        }

        timeline.push({ 
            label: "Year " + year, 
            ice: iceCumulative, 
            ev: evCumulative, 
            isCumulativeCost: true, 
            isSeparator: false,
            noteIce: yearTaxNoteIce,
            noteEv: yearTaxNoteEv
        });
    }

    const exShowroomPremium = iceExShowroom - evExShowroom; 
    const taxSavings = iceTaxAmt - evTaxAmt; 
    const fuelSavings = totalIceFuelSpent - totalEvEnergySpent;
    const serviceSavings = totalIceSvcSpent - totalEvSvcSpent;
    const netTcoResult = exShowroomPremium + taxSavings + fuelSavings + serviceSavings + totalCorpTaxSaved;

    renderTableAndLedger(timeline, { exShowroomPremium, taxSavings, fuelSavings, serviceSavings, totalCorpTaxSaved, netTcoResult }, breakevenYear);
    renderChart(timeline);

    // EXCHANGE & FINANCE LOGIC
    let finalTradeInEquity = 0;
    if (document.getElementById('exchangeCheck').checked) {
        if (isManualValuationMode) {
            finalTradeInEquity = parseFloat(document.getElementById('manualExchangeInput').value) || 0;
        } else {
            const make = document.getElementById('makeSelect').value;
            const model = document.getElementById('modelSelect').value;
            const year = document.getElementById('yearSelect').value;
            const kms = parseFloat(document.getElementById('odometerInput').value) || 0;
            if (make && model && year && tradeInDatabase[make]?.[model]?.[year]) {
                const rule = tradeInDatabase[make][model][year];
                finalTradeInEquity = Math.max(75000, rule.baseValue - (kms * rule.penalty));
            }
        }
    }
    
    document.getElementById('exchangeValueText').innerText = formatEnIn(finalTradeInEquity);

    const rawDownpaymentAmt = parseFloat(document.getElementById('downPaymentInput').value) || 0;
    const tenureYears = parseInt(document.getElementById('loanTenure').value);
    const interestRateVal = parseFloat(document.getElementById('interestRate').value);
    
    const evOnRoadTotal = evExShowroom + evTaxAmt;
    const evPrincipal = Math.max(0, evOnRoadTotal - rawDownpaymentAmt - finalTradeInEquity);
    
    const monthlyRate = (interestRateVal / 100) / 12;
    const totalMonths = tenureYears * 12;
    const calculatedMonthlyEMI = evPrincipal > 0 ? (evPrincipal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1) : 0;
    
    // Render Finance Ledger
    document.getElementById('financeOnRoadDisp').innerText = formatToLakhsString(evOnRoadTotal);
    document.getElementById('financeExchangeDisp').innerText = "- " + formatToLakhsString(finalTradeInEquity);
    document.getElementById('financeDownDisp').innerText = "- " + formatToLakhsString(rawDownpaymentAmt);
    document.getElementById('financeLoanDisp').innerText = formatToLakhsString(evPrincipal);
    document.getElementById('financeEmiDisp').innerText = formatEnIn(Math.round(calculatedMonthlyEMI)) + "/month";
}

// RENDERERS
function renderTableAndLedger(timeline, ledger, breakevenYear) {
    const tbody = document.getElementById('tcoTableBody');
    tbody.innerHTML = '';
    timeline.forEach(row => {
        const tr = document.createElement('tr');
        let iceClass = ''; let evClass = ''; let marginText = '';

        if (row.ice > row.ev) {
            evClass = 'class="leader-green"';
            marginText = `<span class="val-positive">Save ${formatToLakhsString(row.ice - row.ev)}</span>`;
        } else if (row.ev > row.ice) {
            iceClass = 'class="leader-green"';
            marginText = `<span class="val-negative">Prem. ${formatToLakhsString(row.ev - row.ice)}</span>`;
        } else {
            marginText = '-';
        }

        // Apply thick border for Day 0 separation without adding a blank row
        if (row.isSeparator) {
            tr.style.borderBottom = "2px solid #9ca3af";
        }

        tr.innerHTML = `
            <td><strong>${row.label}</strong></td>
            <td ${iceClass}>${formatToLakhsString(row.ice)}${row.noteIce || ""}</td>
            <td ${evClass}>${formatToLakhsString(row.ev)}${row.noteEv || ""}</td>
            <td><strong>${marginText}</strong></td>
        `;
        tbody.appendChild(tr);
    });

    const ledgerEx = document.getElementById('ledgerExEx');
    if (ledger.exShowroomPremium < 0) {
        ledgerEx.className = "val-negative";
        ledgerEx.innerText = "- " + formatEnIn(Math.abs(Math.round(ledger.exShowroomPremium)));
    } else {
        ledgerEx.className = "val-positive";
        ledgerEx.innerText = "+ " + formatEnIn(Math.round(ledger.exShowroomPremium));
    }
    
    document.getElementById('ledgerTax').innerText = formatEnIn(Math.round(ledger.taxSavings));
    document.getElementById('ledgerFuel').innerText = formatEnIn(Math.round(ledger.fuelSavings));
    document.getElementById('ledgerSvc').innerText = formatEnIn(Math.round(ledger.serviceSavings));
    
    if(ledger.totalCorpTaxSaved > 0) {
        document.getElementById('ledgerCorporateTax').innerText = formatEnIn(Math.round(ledger.totalCorpTaxSaved));
    }
    document.getElementById('ledgerTotal').innerText = formatEnIn(Math.round(ledger.netTcoResult));

    const bCard = document.getElementById('breakevenCard');
    if (breakevenYear && breakevenYear <= 7 && breakevenYear > 0) {
        bCard.classList.remove('hidden');
        document.getElementById('breakevenVal').innerText = breakevenYear.toFixed(1) + " Years";
        
        let yearsStr = Math.floor(breakevenYear);
        let monthsStr = Math.round((breakevenYear - yearsStr) * 12);
        document.getElementById('breakevenSubtext').innerText = `${yearsStr} years ${monthsStr} months`;
    } else {
        bCard.classList.add('hidden');
    }
}

function renderChart(timelineData) {
    const ctx = document.getElementById('tcoChart').getContext('2d');
    if (chart) chart.destroy();

    const plotPoints = timelineData.filter(d => d.isCumulativeCost);
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: plotPoints.map((d, i) => i === 0 ? 'Day 0' : `Yr. ${i}`),
            datasets: [
                { label: 'Mahindra eSUV', data: plotPoints.map(d => d.ev), borderColor: '#00875a', backgroundColor: '#00875a', fill: false, tension: 0.1, pointRadius: 4 },
                { label: 'ICE', data: plotPoints.map(d => d.ice), borderColor: '#0066cc', backgroundColor: '#0066cc', fill: false, tension: 0.1, pointRadius: 4 }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { position: 'top' } },
            scales: {
                y: {
                    ticks: {
                        callback: function(value) { return '₹' + (value/100000).toFixed(2) + ' L'; }
                    }
                }
            }
        }
    });
}
async function generatePDFReport() {
    const target = document.getElementById('pdfSnapshotTarget');
    try {
// 1. Find your Chart instance and convert it into a static image
    // Note: Replace 'myChart' with whatever variable name you used to create your Chart.js instance
    if (window.myChart) {
        const chartCanvas = document.getElementById('yourChartCanvasId'); // Put your actual canvas ID here
        const chartImageObj = new Image();
        
        // Convert the chart to a safe, local base64 data string
        chartImageObj.src = window.myChart.toBase64Image();
        chartImageObj.style.width = chartCanvas.offsetWidth + 'px';
        chartImageObj.style.height = chartCanvas.offsetHeight + 'px';
        
        // Temporarily swap the live canvas with the safe image element
        chartCanvas.parentNode.replaceChild(chartImageObj, chartCanvas);

    const fullCanvas = await html2canvas(target, {
        scale: dynamicScale,
        useCORS: true,                  // Crucial for loading external images/CDNs
        allowTaint: false,              // CRITICAL: Prevent tainted canvases from breaking export
        foreignObjectRendering: false,  // Forces a standard render path, safer for Safari/iOS
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        logging: false                  // Optional: Keeps your console clean in production
    });

    // 3. Swap it back so the interactive chart returns after the PDF builds
        chartImageObj.parentNode.replaceChild(chartCanvas, chartImageObj);

        // Pull the jsPDF constructor from the window.jspdf object (required by jspdf.umd.min.js)
        const { jsPDF } = window.jspdf;

        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const pdfWidth = 210;
        const pdfHeight = 297;
        const margin = 0;

        const usableWidth = pdfWidth - (margin * 2);
        const usableHeight = pdfHeight - (margin * 2);

        const pageCanvasHeight = Math.floor(
            fullCanvas.width * (usableHeight / usableWidth)
        );

        let pageIndex = 0;
        let renderedHeight = 0;

        // Your exact canvas chunking loop - preserved perfectly
        while (renderedHeight < fullCanvas.height) {
            const pageCanvas = document.createElement('canvas');
            const pageCtx = pageCanvas.getContext('2d');

            pageCanvas.width = fullCanvas.width;
            pageCanvas.height = Math.min(
                pageCanvasHeight,
                fullCanvas.height - renderedHeight
            );

            pageCtx.drawImage(
                fullCanvas,
                0,
                renderedHeight,
                fullCanvas.width,
                pageCanvas.height,
                0,
                0,
                fullCanvas.width,
                pageCanvas.height
            );

            const imgData = pageCanvas.toDataURL('image/jpeg', 0.95);

            const imgHeightMM = (pageCanvas.height * usableWidth) / pageCanvas.width;

            if (pageIndex > 0) {
                pdf.addPage();
            }

            pdf.addImage(
                imgData,
                'JPEG',
                margin,
                margin,
                usableWidth,
                imgHeightMM
            );

            renderedHeight += pageCanvas.height;
            pageIndex++;
        }

        console.log(fullCanvas.width, fullCanvas.height);

        // 2. Platform-Specific Action Routing
        if (isIOS) {
            // iOS blocks direct triggers like pdf.save(). 
            // Instead, compile it to a blob and open it natively in a preview window.
            const blobPDF = pdf.output('blob');
            const blobUrl = URL.createObjectURL(blobPDF);
            
            // Redirect the window view into the PDF stream. 
            // From here, users tap Safari's standard Share Sheet icon to "Save to Files" or share.
            window.location.href = blobUrl;
        } else {
            // Unaffected desktop/Android behavior stays completely original
            pdf.save('EV_Savings_Report.pdf');
        }

    } catch (err) {
        console.error("Detailed PDF Error:", err);
        alert('PDF generation failed: ' + err.message);
    }
}