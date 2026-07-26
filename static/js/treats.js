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
            const products = data.products ? data.products : data;
            
            const select = document.getElementById('treatProductSelect');
            select.innerHTML = '<option value="" disabled selected>Select a product...</option>';
            products.forEach(p => {
                const pid = typeof p._id === 'object' ? p._id.$oid : p._id;
                const totalStock = (p.boxes_in_stock * p.units_per_box) + p.loose_units_in_stock;
                select.innerHTML += `<option value="${pid}">${p.name} (Stock: ${totalStock})</option>`;
            });
        }
    } catch (err) {
        console.error("Failed to load products for treats", err);
    }

    loadStaffNames();
    fetchTreatHistory();
}

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

async function fetchTreatHistory() {
    try {
        const res = await fetch('/api/treats');
        if (res.ok) {
            const history = await res.json();
            const tbody = document.getElementById('treatsHistoryBody');
            tbody.innerHTML = '';

            if(history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-500 font-bold">No records found.</td></tr>';
                return;
            }

            history.forEach(log => {
                const dateObj = new Date(log.created_at.$date || log.created_at);
                const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                let reasonBadge = '';
                if(log.reason.includes('Treat')) reasonBadge = 'bg-blue-50 text-blue-500 border-blue-100';
                else if(log.reason.includes('Damaged')) reasonBadge = 'bg-red-50 text-red-500 border-red-100';
                else if(log.reason.includes('Testing')) reasonBadge = 'bg-purple-50 text-purple-500 border-purple-100';
                else reasonBadge = 'bg-green-50 text-green-600 border-green-100';

                tbody.innerHTML += `
                    <tr class="hover:bg-white/60 transition-colors">
                        <td class="p-4 text-xs font-semibold text-gray-500">${dateStr}</td>
                        <td class="p-4 font-black text-gray-800">${log.staff_name}</td>
                        <td class="p-4 font-bold text-gray-700">${log.product_name}</td>
                        <td class="p-4 font-black text-pink-500 text-center text-lg">${log.units_consumed}</td>
                        <td class="p-4"><span class="${reasonBadge} border px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">${log.reason}</span></td>
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
    const productId = document.getElementById('treatProductSelect').value;
    const units = document.getElementById('treatUnits').value;
    const reason = document.getElementById('treatReason').value;

    if(!productId) return alert("Please select a product.");
    if(!staffName) return alert("Please enter a staff name.");

    btn.disabled = true;
    btn.innerText = "PROCESSING...";

    try {
        const response = await fetch('/api/treats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                staff_name: staffName,
                product_id: productId, 
                units_consumed: units, 
                reason: reason 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert("✅ " + data.message);
            document.getElementById('treatUnits').value = 1;
            loadTreatsData(); 
        } else {
            // This will show exactly why it failed (e.g. "Insufficient Stock")
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