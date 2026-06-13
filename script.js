// 1. Initialize Supabase Connection
const SUPABASE_URL = 'https://jwuzpwglpqkohecxkeuf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3dXpwd2dscHFrb2hlY3hrZXVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzNTQ3NTksImV4cCI6MjA5NjkzMDc1OX0.VGST1zYSae2-BHGoq2jXH7qOrPqMHCqR7atibbpd1f8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. Global Data State
let vehiclesData = [];
let statesData = [];

// 3. Fetch Data on Page Load
async function initializeApp() {
    try {
        // Fetch States
        const { data: states, error: statesError } = await db.from('states').select('*');
        if (statesError) throw statesError;
        statesData = states;
        populateStatesDropdown();

        // Fetch Vehicles
        const { data: vehicles, error: vehiclesError } = await db.from('vehicles').select('*');
        if (vehiclesError) throw vehiclesError;
        vehiclesData = vehicles;
        populateVehiclesDropdown();

    } catch (err) {
        console.error("Database connection error:", err);
    }
}

// 4. Populate UI Elements
function populateStatesDropdown() {
    const stateSelect = document.getElementById('stateSelector');
    stateSelect.innerHTML = '<option value="" disabled selected>Select your state...</option>';
    
    statesData.forEach(state => {
        const option = document.createElement('option');
        // We will store the full state object as a JSON string so we can access both EV and ICE multipliers later
        option.value = JSON.stringify(state); 
        option.textContent = state.state_name;
        stateSelect.appendChild(option);
    });
}

function populateVehiclesDropdown() {
    const vehicleContainer = document.getElementById('vehicleOptionsContainer');
    vehicleContainer.innerHTML = ''; // Clears the "Loading..." text
    
    vehiclesData.forEach((vehicle, index) => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.textContent = vehicle.product_variant;
        div.onclick = () => selectVehicle(index);
        vehicleContainer.appendChild(div);
    });
}

// 5. Custom Dropdown Interaction Logic
function selectVehicle(index) {
    const selected = vehiclesData[index];
    document.getElementById('selectedVehicleDisplay').textContent = selected.product_variant;
    document.getElementById('vehicleDropdownMenu').classList.remove('open');
    // We will trigger the math calculations here in Phase 3
}

document.getElementById('selectedVehicleDisplay').addEventListener('click', function() {
    const wrapper = document.getElementById('vehicleDropdownWrapper');
    wrapper.classList.toggle('open');
});

// Start the engine
window.addEventListener('DOMContentLoaded', initializeApp);