let inventoryData = [];
let showingLowStockOnly = false;

document.addEventListener('DOMContentLoaded', () => {
    loadInventoryData();
});

// --- TOAST NOTIFICATION SYSTEM ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    
    const colors = type === 'error' ? 'bg-red-500' : 'bg-green-500';
    toast.className = `${colors} text-white px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm transform transition-all translate-x-full opacity-0 flex items-center gap-3`;
    toast.innerHTML = `<span class="text-lg">${type === 'error' ? '⚠️' : '✅'}</span> ${message}`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- DATA FETCHING & RENDERING ---
async function loadInventoryData() {
    try {
        const res = await fetch('/api/products');
        if (res.ok) {
            const data = await res.json();
            inventoryData = data.products;
            
            document.getElementById('invTotalValue').innerText = `₹${data.metrics.total_value.toFixed(2)}`;
            document.getElementById('invTotalItems').innerText = data.metrics.total_items;
            document.getElementById('invLowStock').innerText = data.metrics.low_stock_count;

            // NEW: Update Nav Side Panel Alert Badge
            const navBadge = document.getElementById('navLowStockBadge');
            if (navBadge) {
                if (data.metrics.low_stock_count > 0) {
                    navBadge.innerText = data.metrics.low_stock_count;
                    navBadge.classList.remove('hidden');
                } else {
                    navBadge.classList.add('hidden');
                }
            }

            populateCategories();
            filterInventory(); // Triggers sorting and active filters natively
            
            if (typeof loadProducts === "function") loadProducts();
        }
    } catch (err) {
        showToast("Failed to fetch inventory data.", "error");
    }
}

function populateCategories() {
    const filter = document.getElementById('invCategoryFilter');
    const datalist = document.getElementById('categoryList');
    
    const categories = [...new Set(inventoryData.map(p => p.category))];
    
    // Store current value to re-select after populating
    const currentVal = filter.value;
    
    filter.innerHTML = '<option value="all">All Categories</option>';
    categories.forEach(c => {
        filter.innerHTML += `<option value="${c}">${c}</option>`;
    });
    
    // Attempt to restore selection
    if([...filter.options].some(o => o.value === currentVal)) {
        filter.value = currentVal;
    }

    datalist.innerHTML = '';
    categories.forEach(c => {
        datalist.innerHTML += `<option value="${c}">`;
    });
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500 font-bold">No products found for this criteria.</td></tr>`;
        return;
    }

    data.forEach(p => {
        const totalUnits = (p.boxes_in_stock * p.units_per_box) + p.loose_units_in_stock;
        
        // Use updated unit threshold logic (with fallback for old data)
        const threshold = p.low_stock_unit_threshold || (p.low_stock_box_threshold * p.units_per_box);
        const isLowStock = totalUnits <= threshold;
        
        const pid = typeof p._id === 'object' ? p._id.$oid : p._id;

        const statusHtml = isLowStock 
            ? `<span class="bg-red-50 text-red-500 border border-red-100 px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase shadow-sm">LOW STOCK</span>` 
            : `<span class="bg-green-50 text-green-600 border border-green-100 px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wider uppercase shadow-sm">HEALTHY</span>`;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/60 transition-colors group";
        tr.innerHTML = `
            <td class="p-5 font-black text-pink-500">${p.sku}</td>
            <td class="p-5">
                <p class="font-bold text-gray-800">${p.name}</p>
                <p class="text-[10px] text-gray-500 uppercase tracking-widest mt-1">${p.category}</p>
            </td>
            <td class="p-5 font-black text-gray-800">₹${p.price_per_unit.toFixed(2)}</td>
            <td class="p-5">${statusHtml}</td>
            <td class="p-5">
                <p class="text-sm font-bold text-gray-800">${totalUnits} <span class="text-gray-500 font-semibold text-xs">Total Units</span></p>
                <p class="text-[11px] text-gray-500 font-medium mt-1">${p.boxes_in_stock} Box + ${p.loose_units_in_stock} Loose</p>
            </td>
            <td class="p-5 text-right">
                <button onclick='editProduct(${JSON.stringify(p).replace(/'/g, "&#39;")})' class="text-blue-500 hover:text-white font-bold text-xs bg-blue-50 hover:bg-blue-500 px-4 py-2 rounded-xl mr-2 transition-colors border border-blue-100 shadow-sm">Edit</button>
                <button onclick="deleteProduct('${pid}', '${p.name}')" class="text-red-500 hover:text-white font-bold text-xs bg-red-50 hover:bg-red-500 px-4 py-2 rounded-xl transition-colors border border-red-100 shadow-sm">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- FILTER & SIDE PANEL ALERTS ---
function activateLowStockFilter() {
    const invBtn = document.querySelector('[onclick*="inventoryWrapper"]');
    if (invBtn && typeof switchView === 'function') {
        switchView('inventoryWrapper', invBtn);
    }
    showingLowStockOnly = true;
    document.getElementById('clearAlertFilterBtn').classList.remove('hidden');
    filterInventory();
}

function clearLowStockFilter() {
    showingLowStockOnly = false;
    document.getElementById('clearAlertFilterBtn').classList.add('hidden');
    filterInventory();
}

function filterInventory() {
    const query = document.getElementById('invSearch').value.toLowerCase();
    const category = document.getElementById('invCategoryFilter').value;
    const sortBy = document.getElementById('invSortFilter').value;

    let filtered = inventoryData.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query);
        const matchesCat = category === 'all' || p.category === category;
        
        let matchesAlerts = true;
        if (showingLowStockOnly) {
            const totalUnits = (p.boxes_in_stock * p.units_per_box) + p.loose_units_in_stock;
            const threshold = p.low_stock_unit_threshold || (p.low_stock_box_threshold * p.units_per_box);
            matchesAlerts = totalUnits <= threshold;
        }

        return matchesSearch && matchesCat && matchesAlerts;
    });

    // NEW: Sorting logic
    if (sortBy === 'price_asc') {
        filtered.sort((a, b) => a.price_per_unit - b.price_per_unit);
    } else if (sortBy === 'price_desc') {
        filtered.sort((a, b) => b.price_per_unit - a.price_per_unit);
    } // 'default' falls back to API order (updated_at)

    renderInventoryTable(filtered);
}

// --- MODAL & FORM LOGIC ---
function openInvModal() {
    document.getElementById('invForm').reset();
    document.getElementById('invProductId').value = '';
    
    // Setup for Adding New Product
    document.getElementById('invModalTitle').innerText = "Add New Product";
    document.getElementById('invSubmitBtn').innerText = "SAVE PRODUCT";
    document.getElementById('invConfigTitle').innerText = "Initial Stock Setup";
    document.getElementById('lblBoxes').innerText = "Initial Boxes";
    document.getElementById('lblLoose').innerText = "Initial Loose Units";
    
    // Hide read-only display
    document.getElementById('invCurrentStockDisplay').classList.add('hidden');
    
    const modal = document.getElementById('invModal');
    const content = document.getElementById('invModalContent');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closeInvModal() {
    const modal = document.getElementById('invModal');
    const content = document.getElementById('invModalContent');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

function editProduct(p) {
    openInvModal();
    const pid = typeof p._id === 'object' ? p._id.$oid : p._id;
    
    document.getElementById('invProductId').value = pid;
    document.getElementById('invSku').value = p.sku;
    document.getElementById('invName').value = p.name;
    document.getElementById('invCategory').value = p.category;
    document.getElementById('invPrice').value = p.price_per_unit;
    document.getElementById('invUnitsPerBox').value = p.units_per_box;
    
    // Migration: use the new unit threshold if available, otherwise calculate equivalent based on old box value
    document.getElementById('invThreshold').value = p.low_stock_unit_threshold || (p.low_stock_box_threshold * p.units_per_box);
    
    // Setup for Editing Existing Product
    document.getElementById('invModalTitle').innerText = "Edit Product & Stock";
    document.getElementById('invSubmitBtn').innerText = "UPDATE PRODUCT";
    document.getElementById('invConfigTitle').innerText = "Add Stock (Leave as 0 to just edit details)";
    document.getElementById('lblBoxes').innerText = "Add Boxes";
    document.getElementById('lblLoose').innerText = "Add Loose Units";
    
    // Default the add inputs to 0
    document.getElementById('invBoxes').value = 0;
    document.getElementById('invLoose').value = 0;

    // Show the Read-Only current stock stats
    const totalUnits = (p.boxes_in_stock * p.units_per_box) + p.loose_units_in_stock;
    document.getElementById('invCurrentStockText').innerText = `${totalUnits} Total Units (${p.boxes_in_stock} Boxes + ${p.loose_units_in_stock} Loose)`;
    document.getElementById('invCurrentStockDisplay').classList.remove('hidden');
}

document.getElementById('invForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = document.getElementById('invProductId').value;
    const btn = document.getElementById('invSubmitBtn');
    
    const method = pid ? 'PUT' : 'POST';
    const url = pid ? `/api/products/${pid}` : '/api/products';
    
    // Build payload dynamically
    const payload = {
        sku: document.getElementById('invSku').value,
        name: document.getElementById('invName').value,
        category: document.getElementById('invCategory').value,
        price_per_unit: document.getElementById('invPrice').value,
        units_per_box: document.getElementById('invUnitsPerBox').value,
        low_stock_unit_threshold: document.getElementById('invThreshold').value
    };

    if (pid) {
        // We are updating: Send the values as incremental additions
        payload.add_boxes = document.getElementById('invBoxes').value;
        payload.add_loose = document.getElementById('invLoose').value;
    } else {
        // We are creating: Send as initial baseline stock
        payload.boxes_in_stock = document.getElementById('invBoxes').value;
        payload.loose_units_in_stock = document.getElementById('invLoose').value;
    }
    
    btn.disabled = true;
    btn.innerText = "SAVING...";

    try {
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (response.ok) {
            showToast(data.message, 'success');
            closeInvModal();
            loadInventoryData();
        } else {
            showToast(data.error, 'error');
        }
    } catch (err) {
        showToast("Network error occurred.", 'error');
    } finally {
        btn.disabled = false;
        btn.innerText = pid ? "UPDATE PRODUCT" : "SAVE PRODUCT";
    }
});

// --- DELETE LOGIC ---
async function deleteProduct(pid, name) {
    if (!confirm(`⚠️ Are you sure you want to delete "${name}"?\nThis action cannot be undone.`)) return;

    try {
        const response = await fetch(`/api/products/${pid}`, { method: 'DELETE' });
        const data = await response.json();

        if (response.ok) {
            showToast(data.message, 'success');
            loadInventoryData();
        } else {
            showToast(data.error, 'error');
        }
    } catch (err) {
        showToast("Network error while deleting.", 'error');
    }
}