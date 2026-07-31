let treatsProductCache = [];
let treatsCart = [];

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('treatsForm');
    if(form) {
        form.addEventListener('submit', handleTreatSubmission);
    }
});

async function loadTreatsData() {
    try {
        const prodRes = await fetch('/api/products');
        if (prodRes.ok) {
            const data = await prodRes.json();
            treatsProductCache = data.products ? data.products : data;
            
            const datalist = document.getElementById('treatProductDataList');
            datalist.innerHTML = '';
            treatsProductCache.forEach(p => {
                const pid = typeof p._id === 'object' ? p._id.$oid : p._id;
                const totalStock = (p.boxes_in_stock * p.units_per_box) + p.loose_units_in_stock;
                // Add the Name to value, and store ID in data-id
                datalist.innerHTML += `<option data-id="${pid}" value="${p.name} | Stock: ${totalStock}"></option>`;
            });
        }
    } catch (err) {
        console.error("Failed to load products for treats", err);
    }

    loadStaffNames();
    fetchTreatHistory();
    fetchTreatsSummary(); 
}

// --- NEW MINI-CART LOGIC ---
function addTreatItem() {
    const searchInput = document.getElementById('treatProductSearch');
    const val = searchInput.value;
    
    // Find the option in the datalist that matches the input string exactly
    const option = document.querySelector(`#treatProductDataList option[value="${val.replace(/"/g, '\\"')}"]`);
    if (!option) {
        return alert("Please select a valid product from the dropdown list.");
    }

    const pid = option.getAttribute('data-id');
    const product = treatsProductCache.find(p => (typeof p._id === 'object' ? p._id.$oid : p._id) === pid);
    
    if (!product) return;

    const existingItem = treatsCart.find(i => i.product_id === pid);
    if (existingItem) {
        existingItem.units += 1;
    } else {
        treatsCart.push({
            product_id: pid,
            name: product.name,
            units: 1,
            max_stock: (product.boxes_in_stock * product.units_per_box) + product.loose_units_in_stock
        });
    }

    searchInput.value = ''; // Clear search bar
    renderTreatsCart();
}

function updateTreatQty(productId, change) {
    const item = treatsCart.find(i => i.product_id === productId);
    if (item) {
        item.units += change;
        if (item.units <= 0) {
            treatsCart = treatsCart.filter(i => i.product_id !== productId);
        } else if (item.units > item.max_stock) {
            item.units = item.max_stock;
            alert(`Only ${item.max_stock} units available in stock!`);
        }
        renderTreatsCart();
    }
}

function renderTreatsCart() {
    const container = document.getElementById('treatCartContainer');
    const list = document.getElementById('treatCartList');
    
    if (treatsCart.length === 0) {
        container.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    container.classList.remove('hidden');
    list.innerHTML = '';

    treatsCart.forEach(item => {
        const li = document.createElement('li');
        li.className = "bg-white p-2.5 rounded-xl border border-pink-50 shadow-sm flex justify-between items-center";
        li.innerHTML = `
            <p class="font-bold text-gray-800 text-sm flex-1 truncate">${item.name}</p>
            <div class="flex items-center gap-2">
                <button type="button" onclick="updateTreatQty('${item.product_id}', -1)" class="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold flex items-center justify-center transition-colors">-</button>
                <span class="text-sm font-black w-4 text-center text-pink-500">${item.units}</span>
                <button type="button" onclick="updateTreatQty('${item.product_id}', 1)" class="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold flex items-center justify-center transition-colors">+</button>
            </div>
        `;
        list.appendChild(li);
    });
}
// -----------------------------

async function loadStaffNames() {
    try {
        const res = await fetch('/api/treats/staff');
        if (res.ok) {
            const staffList = await res.json();
            const datalist = document.getElementById('staffNameList');
            datalist.innerHTML = ''; 
            
            staffList.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                datalist.appendChild(option);
            });
        }
    } catch (err) {
        console.error("Failed to load staff names", err);
    }
}

async function fetchTreatsSummary() {
    try {
        const res = await fetch('/api/treats/summary');
        if (res.ok) {
            const data = await res.json();
            
            document.getElementById('overallTreatsTotal').innerText = `₹${data.overall_total.toFixed(2)}`;
            
            const container = document.getElementById('staffDuesContainer');
            container.innerHTML = '';
            
            if(data.summary.length === 0) {
                container.innerHTML = '<div class="col-span-full p-4 text-center text-gray-500 font-bold text-sm">No pending dues.</div>';
                return;
            }
            
            data.summary.forEach(staff => {
                container.innerHTML += `
                    <div class="bg-white/80 backdrop-blur-md border border-pink-100 p-5 rounded-2xl shadow-sm flex justify-between items-center hover:shadow-md transition-shadow">
                        <div>
                            <h4 class="font-black text-gray-800 text-lg">${staff._id}</h4>
                            <p class="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">${staff.total_items} items consumed</p>
                            <button onclick="settleDues('${staff._id}')" class="mt-3 bg-green-50 hover:bg-green-500 text-green-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-green-200 shadow-sm">
                                ✓ Settle Dues
                            </button>
                        </div>
                        <div class="text-right bg-pink-50 px-4 py-2 rounded-xl border border-pink-100">
                            <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Owes</p>
                            <p class="font-black text-pink-500 text-xl">₹${staff.total_owed.toFixed(2)}</p>
                        </div>
                    </div>
                `;
            });
        }
    } catch (err) {
        console.error("Failed to load treats summary", err);
    }
}

async function settleDues(staffName) {
    if(!confirm(`Are you sure you want to mark all pending dues for ${staffName} as settled/paid?`)) return;
    
    try {
        const response = await fetch('/api/treats/settle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff_name: staffName })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert("✅ " + data.message);
            fetchTreatsSummary(); 
            fetchTreatHistory(); 
        } else {
            alert("⚠️ Error: " + data.error);
        }
    } catch (err) {
        console.error("Settle error:", err);
        alert("⚠️ A network error occurred.");
    }
}

// NEW: API Call to Delete an individual log
async function deleteTreatLog(treatId) {
    if(!confirm(`⚠️ Are you sure you want to delete this log? \n\nThe stock will be automatically added back to the inventory.`)) return;

    try {
        const response = await fetch(`/api/treats/${treatId}`, { method: 'DELETE' });
        const data = await response.json();
        
        if (response.ok) {
            alert("✅ " + data.message);
            loadTreatsData(); // Reloads history, summary, and product stock
        } else {
            alert("⚠️ Error: " + data.error);
        }
    } catch (err) {
        console.error("Delete error:", err);
        alert("⚠️ A network error occurred.");
    }
}

async function fetchTreatHistory() {
    try {
        const res = await fetch('/api/treats');
        if (res.ok) {
            const history = await res.json();
            const tbody = document.getElementById('treatsHistoryBody');
            tbody.innerHTML = '';

            if(history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-500 font-bold">No records found.</td></tr>';
                return;
            }

            history.forEach(log => {
                const tid = typeof log._id === 'object' ? log._id.$oid : log._id;
                const dateObj = new Date(log.created_at.$date || log.created_at);
                const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                let reasonBadge = '';
                if(log.reason.includes('Treat')) reasonBadge = 'bg-blue-50 text-blue-500 border-blue-100';
                else if(log.reason.includes('Damaged')) reasonBadge = 'bg-red-50 text-red-500 border-red-100';
                else if(log.reason.includes('Testing')) reasonBadge = 'bg-purple-50 text-purple-500 border-purple-100';
                else reasonBadge = 'bg-green-50 text-green-600 border-green-100';

                const settledLabel = log.status === 'settled' ? ' <span class="text-green-500 ml-1">✓</span>' : '';

                tbody.innerHTML += `
                    <tr class="hover:bg-white/60 transition-colors group">
                        <td class="p-4 text-xs font-semibold text-gray-500">${dateStr}</td>
                        <td class="p-4 font-black text-gray-800">${log.staff_name}</td>
                        <td class="p-4 font-bold text-gray-700">${log.product_name}</td>
                        <td class="p-4 font-black text-pink-500 text-center text-lg">${log.units_consumed}</td>
                        <td class="p-4"><span class="${reasonBadge} border px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">${log.reason}${settledLabel}</span></td>
                        <td class="p-4 text-right">
                            <button onclick="deleteTreatLog('${tid}')" title="Delete & Revert Stock" class="w-8 h-8 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors border border-red-100 shadow-sm opacity-0 group-hover:opacity-100">
                                <i class="fa-solid fa-trash-can text-xs"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch (err) {
        console.error("Failed to load treat history", err);
    }
}

async function handleTreatSubmission(e) {
    e.preventDefault();
    const btn = document.getElementById('treatSubmitBtn');
    const staffName = document.getElementById('treatStaffName').value;
    const reason = document.getElementById('treatReason').value;

    if (!staffName) return alert("Please enter a staff name.");
    if (treatsCart.length === 0) return alert("Please add at least one product to the log.");

    btn.disabled = true;
    btn.innerText = "PROCESSING...";

    try {
        const response = await fetch('/api/treats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                staff_name: staffName,
                reason: reason,
                items: treatsCart // Send the whole array!
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert("✅ " + data.message);
            treatsCart = []; 
            renderTreatsCart(); 
            loadTreatsData(); 
        } else {
            alert("⚠️ Error: " + data.error);
        }
    } catch (err) {
        console.error("Submission error:", err);
        alert("⚠️ A network error occurred.");
    } finally {
        btn.disabled = false;
        btn.innerText = "DEDUCT FROM STOCK";
    }
}