let inventoryData = [];

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
    
    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    }, 10);

    // Animate out and remove
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
            
            // Update Dashboard Metrics
            document.getElementById('invTotalValue').innerText = `₹${data.metrics.total_value.toFixed(2)}`;
            document.getElementById('invTotalItems').innerText = data.metrics.total_items;
            document.getElementById('invLowStock').innerText = data.metrics.low_stock_count;

            populateCategories();
            renderInventoryTable(inventoryData);
            
            // Refresh POS data simultaneously
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
    
    filter.innerHTML = '<option value="all">All Categories</option>';
    categories.forEach(c => {
        filter.innerHTML += `<option value="${c}">${c}</option>`;
    });

    datalist.innerHTML = '';
    categories.forEach(c => {
        datalist.innerHTML += `<option value="${c}">`;
    });
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-500 font-bold">No products found.</td></tr>`;
        return;
    }

    data.forEach(p => {
        const totalUnits = (p.boxes_in_stock * p.units_per_box) + p.loose_units_in_stock;
        const isLowStock = totalUnits <= (p.low_stock_box_threshold * p.units_per_box);
        const pid = typeof p._id === 'object' ? p._id.$oid : p._id;

        // Light theme badges
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
                <p class="text-sm font-bold text-gray-800">${p.boxes_in_stock} <span class="text-gray-500 font-semibold text-xs">Boxes</span></p>
                <p class="text-[11px] text-gray-500 font-medium mt-1">+ ${p.loose_units_in_stock} Loose <span class="opacity-70">(${p.units_per_box}/box)</span></p>
            </td>
            <td class="p-5 text-right">
                <button onclick='editProduct(${JSON.stringify(p).replace(/'/g, "&#39;")})' class="text-blue-500 hover:text-white font-bold text-xs bg-blue-50 hover:bg-blue-500 px-4 py-2 rounded-xl mr-2 transition-colors border border-blue-100 shadow-sm">Edit</button>
                <button onclick="deleteProduct('${pid}', '${p.name}')" class="text-red-500 hover:text-white font-bold text-xs bg-red-50 hover:bg-red-500 px-4 py-2 rounded-xl transition-colors border border-red-100 shadow-sm">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterInventory() {
    const query = document.getElementById('invSearch').value.toLowerCase();
    const category = document.getElementById('invCategoryFilter').value;

    const filtered = inventoryData.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query);
        const matchesCat = category === 'all' || p.category === category;
        return matchesSearch && matchesCat;
    });

    renderInventoryTable(filtered);
}

// --- MODAL & FORM LOGIC ---
function openInvModal() {
    document.getElementById('invForm').reset();
    document.getElementById('invProductId').value = '';
    document.getElementById('invModalTitle').innerText = "Add New Product";
    document.getElementById('invSubmitBtn').innerText = "SAVE PRODUCT";
    
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
    
    document.getElementById('invModalTitle').innerText = "Edit Product";
    document.getElementById('invSubmitBtn').innerText = "UPDATE PRODUCT";
    
    document.getElementById('invProductId').value = pid;
    document.getElementById('invSku').value = p.sku;
    document.getElementById('invName').value = p.name;
    document.getElementById('invCategory').value = p.category;
    document.getElementById('invPrice').value = p.price_per_unit;
    document.getElementById('invUnitsPerBox').value = p.units_per_box;
    document.getElementById('invBoxes').value = p.boxes_in_stock;
    document.getElementById('invLoose').value = p.loose_units_in_stock;
    document.getElementById('invThreshold').value = p.low_stock_box_threshold;
}

document.getElementById('invForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = document.getElementById('invProductId').value;
    const btn = document.getElementById('invSubmitBtn');
    
    const payload = {
        sku: document.getElementById('invSku').value,
        name: document.getElementById('invName').value,
        category: document.getElementById('invCategory').value,
        price_per_unit: document.getElementById('invPrice').value,
        units_per_box: document.getElementById('invUnitsPerBox').value,
        boxes_in_stock: document.getElementById('invBoxes').value,
        loose_units_in_stock: document.getElementById('invLoose').value,
        low_stock_box_threshold: document.getElementById('invThreshold').value
    };

    const method = pid ? 'PUT' : 'POST';
    const url = pid ? `/api/products/${pid}` : '/api/products';
    
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