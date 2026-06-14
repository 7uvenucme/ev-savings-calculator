// 1. Initialize Supabase Connection
const SUPABASE_URL = 'https://jwuzpwglpqkohecxkeuf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3dXpwd2dscHFrb2hlY3hrZXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTQ3NTksImV4cCI6MjA5NjkzMDc1OX0.VGST1zYSae2-BHGoq2jXH7qOrPqMHCqR7atibbpd1f8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. GLOBAL STATE
let chart;
let vehiclesData = [];
let statesData = [];
let tradeInDatabase = {};
let currentSpreadsheetVehicle = null;

// Base configuration limits
const MAX_WEEKLY_KM = 1200;
const MAX_MONTHLY_KM = 15000;

// 3. BOOTSTRAP APP
window.onload = async () => {
    try {
        // Fetch States
        const { data: states } = await db.from('states').select('*');
        if (states) statesData = states;

        // Fetch Vehicles
        const { data: vehicles } = await db.from('vehicles').select('*');
        if (vehicles) vehiclesData = vehicles;

        // Fetch Resale Value matrix and structure it locally for V1 Exchange logic
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

        populateCoreDropdowns();
        attachEventListeners();

    } catch (err) {
        console.error("Database connection error:", err);
        alert("Failed to load database parameters. Please check your internet connection.");
    }
};

// 4. UI POPULATION & EVENT LISTENERS
function populateCoreDropdowns() {
    const vSelect = document.getElementById('vehicleSelect');
    const sSelect = document.getElementById('stateSelect');
    
    vSelect.innerHTML = '<option value="" disabled selected>Select an eSUV variant...</option>';
    sSelect.innerHTML = '<option value="" disabled selected>Select state...</option>';
    
    // Sort and populate Vehicles
    vehiclesData.forEach(v => {
        const option = document.createElement('option');
        option.value = JSON.stringify(v);
        option.innerText = v.product_variant;
        vSelect.appendChild(option);
    });
    
    // Populate States
    statesData.forEach(s => {
        const option = document.createElement('option');
        option.value = JSON.stringify(s);
        option.innerText = s.state_name;
        sSelect.appendChild(option);
    });

    // Default Select XEV 9e Pack Three 79 kWh if it exists in the array
    const defaultIndex = Array.from(vSelect.options).findIndex(opt => opt.innerText.includes("XEV 9e Pack Three 79"));
    if (defaultIndex > -1) {
        vSelect.selectedIndex = defaultIndex;
        handleVehicleChange();
    }
}

function attachEventListeners() {
    // Stepper Controls
    document.getElementById('btnDecDist').addEventListener('click', () => adjustDistance(-1));
    document.getElementById('btnIncDist').addEventListener('click', () => adjustDistance(1));
    document.getElementById('freqSelect').addEventListener('change', handleFrequencyChange);

    // Fuel Type Pill Selection
    document.getElementById('cardDiesel').addEventListener('click', () => selectFuelType('diesel'));
    document.getElementById('cardPetrol').addEventListener('click', () => selectFuelType('petrol'));

    // Driving Mix Slider
    document.getElementById('routeSplitSlider').addEventListener('input', (e) => {
        const highway = e.target.value;
        const city = 100 - highway;
        document.getElementById('cityLabel').innerText = `City: ${city}%`;
        document.getElementById('highwayLabel').innerText = `Highway: ${highway}%`;
        updateCalculations();
    });

    // Main Overrides & Toggles
    document.getElementById('vehicleSelect').addEventListener('change', handleVehicleChange);
    document.getElementById('stateSelect').addEventListener('change', updateCalculations);
    document.getElementById('businessPurchaseCheck').addEventListener('change', toggleBusinessSection);
    document.getElementById('corporateTaxRate').addEventListener('change', updateCalculations);
    document.getElementById('exchangeCheck').addEventListener('change', toggleExchangeSection);
    document.getElementById('fallbackToggleBtn').addEventListener('click', toggleValuationPath);

    // Baseline Overrides with Masks
    setupCurrencyMask('overrideIceExPrice', 'maskIceExPrice');
    setupCurrencyMask('overrideEvExPrice', 'maskEvExPrice');
    setupCurrencyMask('manualResaleInput', 'maskManualResale');
    setupCurrencyMask('downPaymentInput', 'maskDownPayment');

    // Advanced Assumptions
    document.getElementById('toggleAssumptionsBtn').addEventListener('click', () => {
        document.getElementById('baselineAccordion').classList.toggle('hidden');
    });

    // Attach update hooks to all advanced inputs
    const advInputs = ['varPetrolPrice', 'varDieselPrice', 'varHomeCharge', 'varPublicCharge', 'varPetrolEff', 'varDieselEff', 'varEvEff', 'varEvSvc', 'varPetrolSvc', 'varDieselSvc', 'loanTenure', 'interestRate', 'odometerInput'];
    advInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', updateCalculations);
    });

    // PDF Generator
    document.getElementById('btnDownloadPdf').addEventListener('click', generatePDFReport);
}

// 5. INTERACTION HANDLERS
function selectFuelType(type) {
    document.getElementById('cardDiesel').classList.toggle('selected', type === 'diesel');
    document.getElementById('cardPetrol').classList.toggle('selected', type === 'petrol');
    document.querySelector(`input[name="fuelType"][value="${type}"]`).checked = true;
    
    // Update the baseline label
    document.getElementById('lblSpreadsheetIcePrice').innerText = type === 'petrol' ? 'Petrol Ex-Sh' : 'Diesel Ex-Sh';
    
    // Refresh vehicle mapping if selected
    handleVehicleChange();
}

let currentDistance = 400;
function adjustDistance(direction) {
    const isMonthly = document.getElementById('freqSelect').value === 'monthly';
    const step = isMonthly ? 100 : 50;
    const max = isMonthly ? MAX_MONTHLY_KM : MAX_WEEKLY_KM;
    
    currentDistance += (step * direction);
    if (currentDistance < step) currentDistance = step;
    if (currentDistance > max) currentDistance = max;
    
    document.getElementById('distDisplay').innerText = currentDistance;
    updateCalculations();
}

function handleFrequencyChange() {
    const isMonthly = document.getElementById('freqSelect').value === 'monthly';
    // Reset to sensible defaults on swap
    currentDistance = isMonthly ? 1500 : 400;
    document.getElementById('distDisplay').innerText = currentDistance;
    updateCalculations();
}

function handleVehicleChange() {
    const selectEl = document.getElementById('vehicleSelect');
    if (!selectEl.value) return;
    
    currentSpreadsheetVehicle = JSON.parse(selectEl.value);
    const fuelType = document.querySelector('input[name="fuelType"]:checked').value;
    
    const iceExSh = fuelType === 'petrol' ? currentSpreadsheetVehicle.petrol_exsh_comp : currentSpreadsheetVehicle.diesel_exsh_comp;
    
    document.getElementById('overrideIceExPrice').value = iceExSh;
    document.getElementById('overrideEvExPrice').value = currentSpreadsheetVehicle.ex_showroom_ev;
    
    // Trigger visual mask updates
    document.getElementById('overrideIceExPrice').dispatchEvent(new Event('input'));
    document.getElementById('overrideEvExPrice').dispatchEvent(new Event('input'));
    
    updateCalculations();
}

function toggleBusinessSection() {
    const isChecked = document.getElementById('businessPurchaseCheck').checked;
    document.getElementById('businessOptionsContainer').classList.toggle('hidden', !isChecked);
    document.getElementById('rowCorporateTax').classList.toggle('hidden', !isChecked);
    updateCalculations();
}

function toggleExchangeSection() {
    const isChecked = document.getElementById('exchangeCheck').checked;
    document.getElementById('exchangeSection').classList.toggle('hidden', !isChecked);
    updateCalculations();
}

function toggleValuationPath() {
    isManualValuationMode = !isManualValuationMode;
    document.getElementById('matrixEvaluationContainer').classList.toggle('hidden', isManualValuationMode);
    document.getElementById('manualValuationContainer').classList.toggle('hidden', !isManualValuationMode);
    document.getElementById('fallbackToggleBtn').innerText = isManualValuationMode ? "Use guided vehicle list selection" : "Can't find your car? Enter manually";
    updateCalculations();
}

function setupCurrencyMask(inputId, maskId) {
    const input = document.getElementById(inputId);
    const mask = document.getElementById(maskId);
    
    input.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value) || 0;
        mask.innerText = "₹ " + val.toLocaleString('en-IN');
        updateCalculations(); // Recalculate on manual override
    });
}

// Resale Matrix Helpers
function populateMakes() {
    const makeSelect = document.getElementById('makeSelect');
    makeSelect.innerHTML = '<option value="">Select Make</option>';
    Object.keys(tradeInDatabase).forEach(make => {
        let opt = document.createElement('option'); opt.value = make; opt.innerText = make;
        makeSelect.appendChild(opt);
    });
    makeSelect.addEventListener('change', updateModels);
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
    modelSelect.addEventListener('change', updateYears);
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
    yearSelect.addEventListener('change', updateCalculations);
    updateCalculations();
}

// 6. CORE MATH ENGINE
function updateCalculations() {
    if (!currentSpreadsheetVehicle) return;
    
    // State Logic
    const stateObj = document.getElementById('stateSelect').value ? JSON.parse(document.getElementById('stateSelect').value) : {overhead_multiplier_ice: 0.20, overhead_multiplier_ev: 0.05};
    
    // Usage Logic
    const isMonthly = document.getElementById('freqSelect').value === 'monthly';
    const annualMileage = isMonthly ? currentDistance * 12 : currentDistance * 52;
    const highwaySplit = parseFloat(document.getElementById('routeSplitSlider').value) / 100;
    const citySplit = 1 - highwaySplit;
    
    // Fuel Setup
    const fuelType = document.querySelector('input[name="fuelType"]:checked').value;
    const isPetrol = (fuelType === 'petrol');
    
    // Overrides
    const iceExShowroom = parseFloat(document.getElementById('overrideIceExPrice').value) || 0;
    const evExShowroom = parseFloat(document.getElementById('overrideEvExPrice').value) || 0;
    
    // Custom Variables
    const petrolPrice = parseFloat(document.getElementById('varPetrolPrice').value);
    const dieselPrice = parseFloat(document.getElementById('varDieselPrice').value);
    const homeCharge = parseFloat(document.getElementById('varHomeCharge').value);
    const publicCharge = parseFloat(document.getElementById('varPublicCharge').value);
    
    const iceEff = isPetrol ? parseFloat(document.getElementById('varPetrolEff').value) : parseFloat(document.getElementById('varDieselEff').value);
    const evEff = parseFloat(document.getElementById('varEvEff').value);
    
    // blended charging cost
    const blendedUnitCost = (citySplit * homeCharge) + (highwaySplit * publicCharge);
    
    // Cost per KM
    const iceCostPerKm = (isPetrol ? petrolPrice : dieselPrice) / iceEff;
    const evCostPerKm = blendedUnitCost / evEff;

    // Day 0 Taxes & Overheads
    const iceTaxAmt = iceExShowroom * stateObj.overhead_multiplier_ice;
    const evTaxAmt = evExShowroom * stateObj.overhead_multiplier_ev;
    
    let iceCumulative = iceExShowroom + iceTaxAmt;
    let evCumulative = evExShowroom + evTaxAmt;

    // Business Tax Parameters
    const isBusiness = document.getElementById('businessPurchaseCheck').checked;
    const corpTaxRate = parseFloat(document.getElementById('corporateTaxRate').value);
    let iceWdv = iceExShowroom;
    let evWdv = evExShowroom;
    let totalCorpTaxSaved = 0;

    // Timeline Generation
    let timeline = [];
    
    // Base Milestones
    timeline.push({ label: "Ex-sh.", ice: Math.round(iceExShowroom), ev: Math.round(evExShowroom), isCumulativeCost: false, isSeparator: false });
    timeline.push({ label: "Road Tax, Ins. & other charges", ice: Math.round(iceTaxAmt), ev: Math.round(evTaxAmt), isCumulativeCost: false, isSeparator: false });
    timeline.push({ label: "Day 0 Upfront Cost", ice: Math.round(iceCumulative), ev: Math.round(evCumulative), isCumulativeCost: true, isSeparator: true });

    let totalIceFuelSpent = 0; let totalEvEnergySpent = 0;
    let totalIceSvcSpent = 0; let totalEvSvcSpent = 0;
    let breakevenYear = null;

    let tempEvSvcRate = parseFloat(document.getElementById('varEvSvc').value);
    let tempIceSvcRate = isPetrol ? parseFloat(document.getElementById('varPetrolSvc').value) : parseFloat(document.getElementById('varDieselSvc').value);

    // 7 Year Projection Loop
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

        // Corporate Tax Shield WDV Logic
        let yearTaxNote = "";
        if (isBusiness) {
            let iceDepreciation = iceWdv * 0.15;
            let evDepreciation = evWdv * 0.40;
            
            let iceTaxShield = iceDepreciation * corpTaxRate;
            let evTaxShield = evDepreciation * corpTaxRate;
            
            // Subtracting the actual cash saved from the cumulative out-of-pocket
            iceCumulative -= iceTaxShield;
            evCumulative -= evTaxShield;
            
            totalCorpTaxSaved += (evTaxShield - iceTaxShield);
            
            iceWdv -= iceDepreciation;
            evWdv -= evDepreciation;
            
            yearTaxNote = `<br><span style="font-size:10px; color:var(--text-secondary);">(incl. ₹${((evTaxShield - iceTaxShield)/100000).toFixed(2)}L Tax Saved)</span>`;
        }

        tempEvSvcRate *= 1.05;
        tempIceSvcRate *= 1.20;

        if (evCumulative <= iceCumulative && breakevenYear === null) {
            // Rough linear interpolation for month of crossover
            let prevYearIce = iceCumulative - (yrIceFuel + yrIceSvc);
            let prevYearEv = evCumulative - (yrEvEnergy + yrEvSvc);
            let prevDiff = prevYearEv - prevYearIce;
            let catchupRate = (yrIceFuel + yrIceSvc) - (yrEvEnergy + yrEvSvc);
            breakevenYear = (year - 1) + (prevDiff / catchupRate);
        }

        timeline.push({ 
            label: "Year " + year, 
            ice: Math.round(iceCumulative), 
            ev: Math.round(evCumulative), 
            isCumulativeCost: true, 
            isSeparator: false,
            note: yearTaxNote
        });
    }

    const exShowroomPremium = iceExShowroom - evExShowroom; 
    const taxSavings = iceTaxAmt - evTaxAmt; 
    const fuelSavings = totalIceFuelSpent - totalEvEnergySpent;
    const serviceSavings = totalIceSvcSpent - totalEvSvcSpent;
    
    const netTcoResult = exShowroomPremium + taxSavings + fuelSavings + serviceSavings + totalCorpTaxSaved;

    // Render Output
    renderTableAndLedger(timeline, { exShowroomPremium, taxSavings, fuelSavings, serviceSavings, totalCorpTaxSaved, netTcoResult }, breakevenYear);
    renderChart(timeline);

    // EMI & Exchange Calculation Block
    let finalTradeInEquity = 0;
    if (document.getElementById('exchangeCheck').checked) {
        if (isManualValuationMode) {
            finalTradeInEquity = parseFloat(document.getElementById('manualResaleInput').value) || 0;
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
    document.getElementById('resaleValueText').innerText = "₹ " + finalTradeInEquity.toLocaleString('en-IN');

    const rawDownpaymentAmt = parseFloat(document.getElementById('downPaymentInput').value) || 0;
    const tenureYears = parseInt(document.getElementById('loanTenure').value);
    const interestRateVal = parseFloat(document.getElementById('interestRate').value);
    
    // Day 0 EV Cost
    const evOnRoadTotal = evExShowroom + evTaxAmt;
    const evPrincipal = Math.max(0, evOnRoadTotal - rawDownpaymentAmt - finalTradeInEquity);
    
    const monthlyRate = (interestRateVal / 100) / 12;
    const totalMonths = tenureYears * 12;
    const calculatedMonthlyEMI = evPrincipal > 0 ? (evPrincipal * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1) : 0;
    
    const quoteBox = document.getElementById('imaginationQuote');
    if (evPrincipal <= 0) {
        quoteBox.innerHTML = `Your down payment and trade equity completely cover the eSUV on-road cost! No financing principal remaining.`;
    } else {
        quoteBox.innerHTML = `Financing a net principal of <strong>₹ ${(evPrincipal / 100000).toFixed(2)} Lakh</strong> over ${tenureYears} years. Estimated installment matches <strong>₹ ${Math.round(calculatedMonthlyEMI).toLocaleString('en-IN')} / month</strong>.`;
    }
}

// 7. RENDER HELPER FUNCTIONS
function formatToLakhs(number) {
    return "₹" + (number / 100000).toFixed(2) + " L";
}

function renderTableAndLedger(timeline, ledger, breakevenYear) {
    // LEDGER UI
    const ledgerEx = document.getElementById('ledgerExEx');
    if (ledger.exShowroomPremium < 0) {
        ledgerEx.className = "val-negative";
        ledgerEx.innerText = "- ₹" + Math.abs(Math.round(ledger.exShowroomPremium)).toLocaleString('en-IN');
    } else {
        ledgerEx.className = "val-positive";
        ledgerEx.innerText = "+ ₹" + Math.round(ledger.exShowroomPremium).toLocaleString('en-IN');
    }
    
    document.getElementById('ledgerTax').innerText = "₹" + Math.round(ledger.taxSavings).toLocaleString('en-IN');
    document.getElementById('ledgerFuel').innerText = "₹" + Math.round(ledger.fuelSavings).toLocaleString('en-IN');
    document.getElementById('ledgerSvc').innerText = "₹" + Math.round(ledger.serviceSavings).toLocaleString('en-IN');
    
    if(ledger.totalCorpTaxSaved > 0) {
        document.getElementById('ledgerCorporateTax').innerText = "₹" + Math.round(ledger.totalCorpTaxSaved).toLocaleString('en-IN');
    }
    
    const totalNode = document.getElementById('ledgerTotal');
    totalNode.innerText = "₹" + Math.round(ledger.netTcoResult).toLocaleString('en-IN');

    // BREAKEVEN HERO
    const bCard = document.getElementById('breakevenCard');
    if (breakevenYear && breakevenYear <= 7) {
        bCard.classList.remove('hidden');
        document.getElementById('breakevenVal').innerText = breakevenYear.toFixed(1) + " Years";
    } else {
        bCard.classList.add('hidden');
    }

    // TABLE UI
    const tbody = document.getElementById('tcoTableBody');
    tbody.innerHTML = '';
    timeline.forEach(row => {
        const tr = document.createElement('tr');
        let iceClass = ''; let evClass = ''; let marginText = '';

        if (row.ice < row.ev) {
            iceClass = 'class="leader-green"';
            marginText = `ICE saves ${formatToLakhs(row.ev - row.ice)}`;
        } else if (row.ev < row.ice) {
            evClass = 'class="leader-green"';
            marginText = `EV saves ${formatToLakhs(row.ice - row.ev)}`;
        } else {
            marginText = '-';
        }

        tr.innerHTML = `
            <td><strong>${row.label}</strong>${row.note || ""}</td>
            <td ${iceClass}>${formatToLakhs(row.ice)}</td>
            <td ${evClass}>${formatToLakhs(row.ev)}</td>
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
                { label: 'Mahindra eSUV', data: plotPoints.map(d => d.ev), borderColor: '#00875a', backgroundColor: '#00875a', fill: false, tension: 0.1 },
                { label: 'ICE', data: plotPoints.map(d => d.ice), borderColor: '#0066cc', backgroundColor: '#0066cc', fill: false, tension: 0.1 }
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