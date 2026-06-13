// 1. Initialize Supabase Connection
const SUPABASE_URL = 'https://jwuzpwglpqkohecxkeuf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3dXpwd2dscHFrb2hlY3hrZXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTQ3NTksImV4cCI6MjA5NjkzMDc1OX0.VGST1zYSae2-BHGoq2jXH7qOrPqMHCqR7atibbpd1f8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// 2. Global State Variables
let chart;
let currentSpreadsheetVehicle = null;
let vehiclesData = [];
let statesData = [];
let tradeInDatabase = {};
let isManualValuationMode = false;
const FIXED_5YR_SERVICE_SAVINGS = 60000;

// 3. Application Initialization
window.onload = async () => {
    try {
        // Fetch States
        const { data: states } = await db.from('states').select('*');
        if (states) statesData = states;

        // Fetch Vehicles
        const { data: vehicles } = await db.from('vehicles').select('*');
        if (vehicles) vehiclesData = vehicles;

        // Fetch Resale Value matrix and structure it locally
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
            document.getElementById('loadingStatus').classList.add('hidden');
            document.getElementById('dropdownsContainer').classList.remove('hidden');
            populateMakes();
        }

        populateUI();

    } catch (err) {
        console.error("Database connection error:", err);
    }
};

function populateUI() {
    const vSelect = document.getElementById('vehicleSelect');
    const sSelect = document.getElementById('stateSelect');
    vSelect.innerHTML = ''; 
    sSelect.innerHTML = ''; 
    
    vehiclesData.forEach(v => {
        const option = document.createElement('option');
        option.value = JSON.stringify(v);
        option.innerText = v.product_variant;
        vSelect.appendChild(option);
    });
    
    statesData.forEach(s => {
        const option = document.createElement('option');
        option.value = JSON.stringify(s); // Store entire state obj
        option.innerText = s.state_name;
        sSelect.appendChild(option);
    });
    
    handleVehicleChange();
}

function handleVehicleChange() {
    const selectEl = document.getElementById('vehicleSelect');
    if(!selectEl.value) return;
    
    currentSpreadsheetVehicle = JSON.parse(selectEl.value);
    const fuelType = document.querySelector('input[name="fuelType"]:checked').value;
    
    document.getElementById('lblSpreadsheetEvPrice').innerText = `EV Ex-Sh`;
    
    if (fuelType === 'petrol') {
        document.getElementById('lblSpreadsheetIcePrice').innerText = `Petrol Ex-Sh`;
        document.getElementById('overrideIceExPrice').value = currentSpreadsheetVehicle.petrol_exsh_comp;
    } else {
        document.getElementById('lblSpreadsheetIcePrice').innerText = `Diesel Ex-Sh`;
        document.getElementById('overrideIceExPrice').value = currentSpreadsheetVehicle.diesel_exsh_comp;
    }
    
    document.getElementById('overrideEvExPrice').value = currentSpreadsheetVehicle.ex_showroom_ev;
    updateCalculations();
}

function handleFrequencyToggle() {
    const isMonthly = document.getElementById('freqM').checked;
    const slider = document.getElementById('usageSlider');
    const numBox = document.getElementById('distanceNum');
    const scaleDeck = document.getElementById('distanceScaleDeck');
    
    if (isMonthly) {
        slider.max = 15000;
        slider.step = 500;
        slider.value = 5000;
        scaleDeck.className = "scale-track scale-track-monthly";
    } else {
        slider.max = 1200;
        slider.step = 50;
        slider.value = 400;
        scaleDeck.className = "scale-track scale-track-weekly";
    }
    numBox.value = slider.value;
    updateCalculations();
}

function handleSliderDistanceInput() {
    document.getElementById('distanceNum').value = document.getElementById('usageSlider').value;
    updateCalculations();
}

function handleManualDistanceInput() {
    const numBox = document.getElementById('distanceNum');
    let val = parseInt(numBox.value) || 0;
    const isMonthly = document.getElementById('freqM').checked;
    const maxLimit = isMonthly ? 15000 : 1200;
    
    if (val > maxLimit) {
        val = maxLimit;
        numBox.value = maxLimit;
    }
    document.getElementById('usageSlider').value = val; 
    updateCalculations();
}

function handleRouteSplitChange() {
    const highwayVal = document.getElementById('routeSplitSlider').value;
    const cityVal = 100 - highwayVal;
    document.getElementById('cityLabel').innerText = `City: ${cityVal}%`;
    document.getElementById('highwayLabel').innerText = `Highway: ${highwayVal}%`;
    updateCalculations();
}

// Finance Section Handlers (From V1)
function toggleExchangeSection() {
    const isChecked = document.getElementById('exchangeCheck').checked;
    document.getElementById('exchangeSection').classList.toggle('hidden', !isChecked);
    updateCalculations();
}
function toggleIceCompareSection() {
    const isChecked = document.getElementById('iceCompareCheck').checked;
    document.getElementById('iceCompareSection').classList.toggle('hidden', !isChecked);
    updateCalculations();
}
function toggleValuationPath() {
    isManualValuationMode = !isManualValuationMode;
    document.getElementById('matrixEvaluationContainer').classList.toggle('hidden', isManualValuationMode);
    document.getElementById('manualValuationContainer').classList.toggle('hidden', !isManualValuationMode);
    const switchBtn = document.getElementById('fallbackToggleBtn');
    switchBtn.innerText = isManualValuationMode ? "Use guided vehicle list selection" : "Can't find your car? Enter manually";
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
function helperCalculateEmi(principal, annualRate, tenureYears) {
    if (principal <= 0) return 0;
    const monthlyRate = (annualRate / 100) / 12;
    const totalMonths = tenureYears * 12;
    if (monthlyRate === 0) return principal / totalMonths;
    return (principal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1);
}
function formatValueToLakhs(absoluteAmount) {
    const lakhsValue = absoluteAmount / 100000;
    return '₹ ' + lakhsValue.toFixed(2) + ' Lakh';
}

function fetchCustomVars() {
    return {
        petrolPrice: parseFloat(document.getElementById('varPetrolPrice').value),
        dieselPrice: parseFloat(document.getElementById('varDieselPrice').value),
        homeCharge: parseFloat(document.getElementById('varHomeCharge').value),
        publicCharge: parseFloat(document.getElementById('varPublicCharge').value),
        petrolEff: parseFloat(document.getElementById('varPetrolEff').value),
        dieselEff: parseFloat(document.getElementById('varDieselEff').value),
        evEff: parseFloat(document.getElementById('varEvEff').value),
        evSvcRate: parseFloat(document.getElementById('varEvSvc').value),
        petrolSvcRate: parseFloat(document.getElementById('varPetrolSvc').value),
        dieselSvcRate: parseFloat(document.getElementById('varDieselSvc').value),
        overrideIceEx: parseFloat(document.getElementById('overrideIceExPrice').value),
        overrideEvEx: parseFloat(document.getElementById('overrideEvExPrice').value)
    };
}

function updateCalculations() {
    if (!currentSpreadsheetVehicle) return;
    
    // Core Engine Logic mapped locally
    const stateObj = document.getElementById('stateSelect').value ? JSON.parse(document.getElementById('stateSelect').value) : {overhead_multiplier_ice: 0.12, overhead_multiplier_ev: 0.05};
    const distance = parseFloat(document.getElementById('distanceNum').value) || 0;
    const isMonthly = document.getElementById('freqM').checked;
    const fuelType = document.querySelector('input[name="fuelType"]:checked').value;
    
    const annualMileage = isMonthly ? distance * 12 : distance * 52;
    const highwaySplit = parseFloat(document.getElementById('routeSplitSlider').value);
    
    const isPetrol = (fuelType === 'petrol');
    const customVars = fetchCustomVars();
    
    const iceExShowroom = customVars.overrideIceEx || (isPetrol ? currentSpreadsheetVehicle.petrol_exsh_comp : currentSpreadsheetVehicle.diesel_exsh_comp);
    const evExShowroom = customVars.overrideEvEx || currentSpreadsheetVehicle.ex_showroom_ev;

    // TCO Timeline Calculations
    let timeline = [];
    const fuelPrice = isPetrol ? customVars.petrolPrice : customVars.dieselPrice;
    const efficiency = isPetrol ? customVars.petrolEff : customVars.dieselEff;
    const iceFuelCostPerKm = fuelPrice / efficiency;
    
    const highwayRatio = highwaySplit / 100;
    const cityRatio = 1 - highwayRatio;
    const blendedEvUnitCost = (cityRatio * customVars.homeCharge) + (highwayRatio * customVars.publicCharge);
    const evEnergyCostPerKm = blendedEvUnitCost / customVars.evEff;

    let iceTax = iceExShowroom * stateObj.overhead_multiplier_ice;
    let evTax = evExShowroom * stateObj.overhead_multiplier_ev;
    let iceCumulative = iceExShowroom + iceTax;
    let evCumulative = evExShowroom + evTax;

    timeline.push({ label: "Day 1 Upfront Cost", ice: Math.round(iceCumulative), ev: Math.round(evCumulative), isCumulativeCost: true, isSeparator: true });

    let totalIceFuelSpent = 0; let totalEvEnergySpent = 0;
    let totalIceSvcSpent = 0; let totalEvSvcSpent = 0;
    let breakevenYear = null;

    let tempBaseSvcEvRate = customVars.evSvcRate;
    let tempBaseSvcIceRate = isPetrol ? customVars.petrolSvcRate : customVars.dieselSvcRate;

    for (let year = 1; year <= 7; year++) {
        let currentYearIceFuel = annualMileage * iceFuelCostPerKm;
        let currentYearEvEnergy = annualMileage * evEnergyCostPerKm;
        
        let currentYearIceSvc = annualMileage * tempBaseSvcIceRate;
        let currentYearEvSvc = annualMileage * tempBaseSvcEvRate;
        
        totalIceFuelSpent += currentYearIceFuel;
        totalEvEnergySpent += currentYearEvEnergy;
        totalIceSvcSpent += currentYearIceSvc;
        totalEvSvcSpent += currentYearEvSvc;
        
        iceCumulative += currentYearIceFuel + currentYearIceSvc;
        evCumulative += currentYearEvEnergy + currentYearEvSvc;

        tempBaseSvcEvRate *= 1.05;
        tempBaseSvcIceRate *= 1.20;

        if (evCumulative <= iceCumulative && breakevenYear === null) {
            let prevYearIce = iceCumulative - (currentYearIceFuel + currentYearIceSvc);
            let prevYearEv = evCumulative - (currentYearEvEnergy + currentYearEvSvc);
            let prevDiff = prevYearEv - prevYearIce;
            let catchupRate = (currentYearIceFuel + currentYearIceSvc) - (currentYearEvEnergy + currentYearEvSvc);
            breakevenYear = (year - 1) + (prevDiff / catchupRate);
        }

        timeline.push({ label: "End of Year " + year, ice: Math.round(iceCumulative), ev: Math.round(evCumulative), isCumulativeCost: true, isSeparator: false });
    }

    const exShowroomPremium = iceExShowroom - evExShowroom; 
    const taxSavings = iceTax - evTax; 
    const fuelSavings = totalIceFuelSpent - totalEvEnergySpent;
    const serviceSavings = totalIceSvcSpent - totalEvSvcSpent;
    const netTcoResult = exShowroomPremium + taxSavings + fuelSavings + serviceSavings;

    const res = {
        timeline: timeline,
        breakeven: breakevenYear ? breakevenYear.toFixed(1) : null,
        ledger: { exShowroomPremium, taxSavings, fuelSavings, serviceSavings, netTcoResult }
    };

    renderTableAndLedger(res);
    renderChart(res.timeline);

    // --- EXECUTE V1 FINANCING CALCULATIONS ---
    let finalTradeInEquity = 0;
    if (document.getElementById('exchangeCheck').checked) {
        if (isManualValuationMode) {
            finalTradeInEquity = (parseFloat(document.getElementById('manualResaleInput').value) || 0) * 100000;
        } else {
            const make = document.getElementById('makeSelect').value;
            const model = document.getElementById('modelSelect').value;
            const year = document.getElementById('yearSelect').value;
            const kms = parseFloat(document.getElementById('odometerInput').value) || 0;
            if (make && model && year && tradeInDatabase[make]?.[model]?.[year]) {
                const rule = tradeInDatabase[make][model][year];
                finalTradeInEquity = Math.max(0, rule.baseValue - (kms * rule.penalty));
            }
        }
    }
    document.getElementById('resaleValueText').innerText = formatValueToLakhs(finalTradeInEquity);

    const inputDownPaymentLakhs = parseFloat(document.getElementById('downPaymentInput').value) || 0;
    const rawDownpaymentAmt = inputDownPaymentLakhs * 100000;
    const tenureYears = parseInt(document.getElementById('loanTenure').value);
    const interestRateVal = parseFloat(document.getElementById('interestRate').value);
    
    // Using timeline[0] which is "Day 1 Upfront Cost" to grab total EV on-road cost
    const evOnRoadTotal = res.timeline[0].ev;
    const evPrincipal = Math.max(0, evOnRoadTotal - rawDownpaymentAmt - finalTradeInEquity);
    const calculatedMonthlyEMI = helperCalculateEmi(evPrincipal, interestRateVal, tenureYears);
    
    const quoteBox = document.getElementById('imaginationQuote');
    if (evPrincipal <= 0) {
        quoteBox.innerHTML = `Your down payment and trade equity completely cover the eSUV on-road cost! No financing principal remaining.`;
    } else {
        quoteBox.innerHTML = `Financing a net principal of <strong>₹ ${(evPrincipal / 100000).toFixed(2)} Lakh</strong> over ${tenureYears} years. Estimated installment matches <strong>₹ ${Math.round(calculatedMonthlyEMI).toLocaleString('en-IN')} / month</strong>.`;
    }

    if (document.getElementById('iceCompareCheck').checked) {
        const iceExShowroomAmt = (parseFloat(document.getElementById('iceExShowroomInput').value) || 0) * 100000;
        const iceOnRoadAmt = iceExShowroomAmt * (1 + stateObj.overhead_multiplier_ice);
        const upfrontPremiumDelta = evOnRoadTotal - iceOnRoadAmt;
        const icePrincipal = Math.max(0, iceOnRoadAmt - rawDownpaymentAmt - finalTradeInEquity);
        const calculatedIceEMI = helperCalculateEmi(icePrincipal, interestRateVal, tenureYears);
        
        const monthlyEmiGap = calculatedMonthlyEMI - calculatedIceEMI;
        const monthlyOpsSavings = (fuelSavings + serviceSavings) / 84; // Monthly operational saving over 7 years (84 months)
        const operationalEmiNetBalance = monthlyOpsSavings - monthlyEmiGap;
        
        document.getElementById('icePricePremiumText').innerText = (upfrontPremiumDelta >= 0 ? '₹ ' : '-₹ ') + Math.abs(upfrontPremiumDelta / 100000).toFixed(2) + ' Lakh';
        document.getElementById('iceEmiPremiumText').innerText = (monthlyEmiGap >= 0 ? '₹ ' : '-₹ ') + Math.abs(Math.round(monthlyEmiGap)).toLocaleString('en-IN') + ' / month';
        
        const comparisonStatusText = document.getElementById('iceComparisonStatusText');
        const badgeTarget = document.getElementById('breakevenBadgeTarget');
        if (operationalEmiNetBalance > 0) {
            comparisonStatusText.innerHTML = `Your monthly fuel/service savings completely surpass the financing difference by <strong>₹ ${Math.round(operationalEmiNetBalance).toLocaleString('en-IN')} / month</strong>!`;
            badgeTarget.innerHTML = `<span class="breakeven-badge badge-success">Immediate Breakeven Retained</span>`;
        } else {
            const rawBreakevenMonths = Math.abs(upfrontPremiumDelta) / Math.max(1, monthlyOpsSavings);
            comparisonStatusText.innerHTML = `Upfront premium delta recovers through operation yields in approx <strong>${(rawBreakevenMonths / 12).toFixed(1)} Years</strong>.`;
            badgeTarget.innerHTML = `<span class="breakeven-badge badge-alert">Breakeven Profile Active</span>`;
        }
    }
}

function renderTableAndLedger(res) {
    const ledgerEx = document.getElementById('ledgerExEx');
    if (res.ledger.exShowroomPremium < 0) {
        ledgerEx.className = "val-negative";
        ledgerEx.innerText = "- ₹" + Math.abs(Math.round(res.ledger.exShowroomPremium)).toLocaleString('en-IN');
    } else {
        ledgerEx.className = "val-positive";
        ledgerEx.innerText = "+ ₹" + Math.round(res.ledger.exShowroomPremium).toLocaleString('en-IN');
    }
    document.getElementById('ledgerTax').innerText = "₹" + Math.round(res.ledger.taxSavings).toLocaleString('en-IN');
    document.getElementById('ledgerFuel').innerText = "₹" + Math.round(res.ledger.fuelSavings).toLocaleString('en-IN');
    document.getElementById('ledgerSvc').innerText = "₹" + Math.round(res.ledger.serviceSavings).toLocaleString('en-IN');
    
    const totalNode = document.getElementById('ledgerTotal');
    totalNode.className = "val-positive";
    totalNode.innerText = "₹" + Math.round(res.ledger.netTcoResult).toLocaleString('en-IN');

    const bCard = document.getElementById('breakevenCard');
    if (res.breakeven) {
        bCard.classList.remove('hidden');
        document.getElementById('breakevenVal').innerText = res.breakeven + " Years";
    } else {
        bCard.classList.add('hidden');
    }

    const tbody = document.getElementById('tcoTableBody');
    tbody.innerHTML = '';
    res.timeline.forEach(row => {
        const tr = document.createElement('tr');
        let iceClass = ''; let evClass = ''; let marginText = '';

        if (row.ice < row.ev) {
            iceClass = 'class="leader-green"';
            marginText = `ICE +₹${(row.ev - row.ice).toLocaleString('en-IN')}`;
        } else if (row.ev < row.ice) {
            evClass = 'class="leader-green"';
            marginText = `EV +₹${(row.ice - row.ev).toLocaleString('en-IN')}`;
        } else {
            marginText = '-';
        }

        tr.innerHTML = `
            <td><strong>${row.label}</strong></td>
            <td ${iceClass}>₹${row.ice.toLocaleString('en-IN')}</td>
            <td ${evClass}>₹${row.ev.toLocaleString('en-IN')}</td>
            <td>${marginText}</td>
        `;
        tbody.appendChild(tr);

        if (row.isSeparator) {
            const sepTr = document.createElement('tr');
            sepTr.className = 'time-separator-row';
            sepTr.innerHTML = `<td colspan="4"></td>`;
            tbody.appendChild(sepTr);
        }
    });
}

function renderChart(timelineData) {
    const ctx = document.getElementById('tcoChart').getContext('2d');
    if (chart) chart.destroy();

    const plotPoints = timelineData.filter(d => d.isCumulativeCost);
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: plotPoints.map(d => d.label),
            datasets: [
                { label: 'eSUV Total Outlay', data: plotPoints.map(d => d.ev), borderColor: '#00875a', backgroundColor: '#00875a', fill: false, tension: 0.1 },
                { label: 'ICE Car Total Outlay', data: plotPoints.map(d => d.ice), borderColor: '#0066cc', backgroundColor: '#0066cc', fill: false, tension: 0.1 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
    });
}

function generatePDFReport() {
    const targetElement = document.getElementById('pdfSnapshotTarget');
    const options = {
        margin: [10, 10, 10, 10],
        filename: 'EV_Savings_TCO_Report.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(options).from(targetElement).save();
}