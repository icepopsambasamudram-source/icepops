let productsData = [];
let ordersState = [{ id: 1, name: "Tab #1", items: [] }];
let activeOrderId = 1;
let orderCounter = 1;
let recentOrdersData = [];

let currentPayMethod = 'cash';
let cartTotalValue = 0;

document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    
    // Set date pickers to today's date by default
    const today = new Date().toISOString().split('T')[0];
    const billStartEl = document.getElementById('billStart');
    const billEndEl = document.getElementById('billEnd');
    if (billStartEl) billStartEl.value = today;
    if (billEndEl) billEndEl.value = today;
    
    loadOrdersHistory(); // Will now load today's bills automatically
    renderTabs();
});

// --- API FETCHES ---
async function loadProducts() {
    try {
        const res = await fetch('/api/products');
        if (res.ok) {
            const data = await res.json();
            productsData = data.products ? data.products : data; 
            renderPOSProducts(productsData);
        }
    } catch (err) {
        console.error("Failed to load products", err);
    }
}

async function loadOrdersHistory() {
    // Read from inputs, fallback to today if inputs aren't found
    let startInput = document.getElementById('billStart')?.value;
    let endInput = document.getElementById('billEnd')?.value;
    
    if (!startInput || !endInput) {
        const today = new Date().toISOString().split('T')[0];
        startInput = today;
        endInput = today;
    }

    const startISO = `${startInput}T00:00:00Z`;
    const endISO = `${endInput}T23:59:59Z`;

    try {
        const res = await fetch(`/api/orders?start=${startISO}&end=${endISO}`);
        if (res.ok) {
            recentOrdersData = await res.json();
            renderOrders(recentOrdersData);
        }
    } catch (err) {
        console.error("Failed to load orders history", err);
    }
}

// --- MULTI-TAB LOGIC ---
function renderTabs() {
    const container = document.getElementById('tabsContainer');
    container.innerHTML = ''; 

    ordersState.forEach(order => {
        const isActive = order.id === activeOrderId;
        const btn = document.createElement('div');
        
        btn.className = `px-4 py-2 rounded-2xl font-bold transition-all whitespace-nowrap mr-2 border flex items-center gap-2 cursor-pointer ${
            isActive 
            ? 'bg-[#f2b5b8] text-white border-transparent shadow-md shadow-pink-200' 
            : 'bg-white/60 text-gray-500 hover:bg-white border-white/50'
        }`;
        
        btn.innerHTML = `
            <span onclick="switchTab(${order.id})" class="flex-1">${order.name}</span>
            <button onclick="closeTab(event, ${order.id})" class="ml-2 hover:bg-black/20 rounded-full w-5 h-5 flex items-center justify-center transition-colors">&times;</button>
        `;
        container.appendChild(btn);
    });

    const newBtn = document.createElement('button');
    newBtn.className = "px-4 py-2 rounded-2xl font-bold border-2 border-dashed border-[#f2b5b8] text-[#f2b5b8] hover:bg-[#f2b5b8] hover:text-white transition-colors whitespace-nowrap flex items-center";
    newBtn.innerText = "+ New Tab";
    newBtn.onclick = () => {
        orderCounter++;
        ordersState.push({ id: orderCounter, name: `Tab #${orderCounter}`, items: [] });
        activeOrderId = orderCounter;
        renderTabs();
        renderCart();
    };
    container.appendChild(newBtn);
}

function switchTab(id) {
    activeOrderId = id;
    renderTabs();
    renderCart();
}

function closeTab(event, id) {
    event.stopPropagation(); // Prevent triggering switchTab
    
    ordersState = ordersState.filter(o => o.id !== id);
    
    // Always keep at least one tab open
    if(ordersState.length === 0) {
        orderCounter++;
        ordersState.push({ id: orderCounter, name: `Tab #${orderCounter}`, items: [] });
    }
    
    // If we closed the active tab, switch to the first available one
    if (activeOrderId === id) {
        activeOrderId = ordersState[0].id;
    }
    
    renderTabs();
    renderCart();
}

// --- PRODUCT GRID & SEARCH ---
function filterPOSProducts() {
    const query = document.getElementById('posSearch').value.toLowerCase();
    const filtered = productsData.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.category.toLowerCase().includes(query)
    );
    renderPOSProducts(filtered);
}

function renderPOSProducts(dataToRender) {
    const grid = document.getElementById('posProductGrid');
    grid.className = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4";
    grid.innerHTML = '';

    dataToRender.forEach(p => {
        const totalUnits = (p.boxes_in_stock * p.units_per_box) + p.loose_units_in_stock;
        const isLow = totalUnits <= (p.low_stock_box_threshold * p.units_per_box);

        const card = document.createElement('div');
        // Frosted glass cards with a subtle pastel gradient top-border effect
        card.className = "bg-white/70 backdrop-blur-xl p-4 rounded-[2rem] cursor-pointer hover:bg-white transition-all border border-white/80 shadow-sm hover:shadow-xl hover:shadow-pink-100 flex flex-col justify-between group h-36 relative overflow-hidden";
        card.innerHTML = `
            <div class="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-200 to-purple-200 opacity-50 group-hover:opacity-100 transition-opacity"></div>
            <div class="mt-2">
                <h3 class="font-extrabold text-gray-800 text-sm leading-tight group-hover:text-pink-500 transition-colors">${p.name}</h3>
                <p class="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">${p.category}</p>
            </div>
            <div class="flex justify-between items-end mt-2">
                <p class="text-base font-black text-gray-800">₹${p.price_per_unit.toFixed(2)}</p>
                ${isLow ? `<span class="text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-500 px-2 py-1 rounded-lg border border-red-200 shadow-sm">Low</span>` : ''}
            </div>
        `;
        card.onclick = () => addToCart(p);
        grid.appendChild(card);
    });
}

// --- CART LOGIC ---
function addToCart(product) {
    const activeOrder = ordersState.find(o => o.id === activeOrderId);
    const pid = typeof product._id === 'object' ? product._id.$oid : product._id;
    const existingItem = activeOrder.items.find(i => i.product_id === pid);

    if (existingItem) existingItem.quantity += 1;
    else {
        activeOrder.items.push({
            product_id: pid,
            name: product.name,
            price_at_sale: product.price_per_unit,
            quantity: 1
        });
    }
    renderCart();
}

function clearCart() {
    const activeOrder = ordersState.find(o => o.id === activeOrderId);
    activeOrder.items = [];
    renderCart();
}

function updateQty(productId, change) {
    const activeOrder = ordersState.find(o => o.id === activeOrderId);
    const item = activeOrder.items.find(i => i.product_id === productId);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            activeOrder.items = activeOrder.items.filter(i => i.product_id !== productId);
        }
        renderCart();
    }
}

function renderCart() {
    const activeOrder = ordersState.find(o => o.id === activeOrderId);
    const list = document.getElementById('cartItemsList');
    
    list.innerHTML = '';
    cartTotalValue = 0;

    activeOrder.items.forEach(item => {
        cartTotalValue += (item.price_at_sale * item.quantity);
        const li = document.createElement('li');
        li.className = "bg-white p-3 rounded-2xl border border-pink-50 shadow-sm flex justify-between items-center";
        li.innerHTML = `
            <div class="flex-1">
                <p class="font-bold text-gray-800 text-sm leading-tight">${item.name}</p>
                <div class="flex items-center gap-3 mt-2">
                    <button onclick="updateQty('${item.product_id}', -1)" class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold flex items-center justify-center transition-colors">-</button>
                    <span class="text-sm font-black w-4 text-center text-pink-500">${item.quantity}</span>
                    <button onclick="updateQty('${item.product_id}', 1)" class="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold flex items-center justify-center transition-colors">+</button>
                </div>
            </div>
            <div class="text-right ml-2">
                <p class="font-black text-gray-800">₹${(item.price_at_sale * item.quantity).toFixed(2)}</p>
                <p class="text-[10px] font-bold text-gray-400">@ ₹${item.price_at_sale}</p>
            </div>
        `;
        list.appendChild(li);
    });

    document.getElementById('cartTotal').innerText = `₹${cartTotalValue.toFixed(2)}`;
}

// --- ORDER HISTORY & VOIDING LOGIC ---
function filterOrders() {
    // Supports either orderSearch or billSearch HTML IDs safely
    const searchEl = document.getElementById('orderSearch') || document.getElementById('billSearch');
    const query = searchEl ? searchEl.value.toLowerCase() : '';
    
    const filtered = recentOrdersData.filter(o => o.order_number.toLowerCase().includes(query));
    renderOrders(filtered);
}

function renderOrders(data) {
    const tbody = document.getElementById('billsTableBody') || document.getElementById('posOrderHistoryBody');
    if (!tbody) return; // Fail gracefully if table isn't in DOM yet
    
    tbody.innerHTML = '';
    
    if(data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-500 font-bold">No bills found.</td></tr>';
        return;
    }

    data.forEach(order => {
        const oid = typeof order._id === 'object' ? order._id.$oid : order._id;
        const dateObj = new Date(order.created_at.$date || order.created_at);
        const timeStr = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        let methodBadge = '';
        if (order.payment_method === 'cash') methodBadge = '<span class="bg-green-100 text-green-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-green-200">CASH</span>';
        else if (order.payment_method === 'upi') methodBadge = '<span class="bg-blue-100 text-blue-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-blue-200">UPI</span>';
        else methodBadge = '<span class="bg-purple-100 text-purple-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-purple-200">SPLIT</span>';

        let itemsSummary = order.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
        if (itemsSummary.length > 40) itemsSummary = itemsSummary.substring(0, 40) + '...';

        const tr = document.createElement('tr');
        tr.className = "hover:bg-white/40 transition-colors";
        tr.innerHTML = `
            <td class="p-4 font-black text-pink-500 text-sm">${order.order_number}</td>
            <td class="p-4 text-sm font-semibold text-gray-600">${timeStr}</td>
            <td class="p-4 text-sm text-gray-500 font-medium">${itemsSummary}</td>
            <td class="p-4">${methodBadge}</td>
            <td class="p-4 font-black text-gray-800">₹${order.total_amount.toFixed(2)}</td>
            <td class="p-4 text-right">
                <button onclick="voidOrder('${oid}', '${order.order_number}')" class="bg-red-50 hover:bg-red-500 text-red-500 hover:text-white font-bold text-xs px-4 py-2 rounded-xl border border-red-200 transition-colors">
                    Void Bill
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function voidOrder(orderId, orderNum) {
    if (!confirm(`⚠️ Are you sure you want to void bill ${orderNum}?\n\nThis will permanently delete the record and add all items back into your inventory stock.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
        const data = await response.json();
        
        if (response.ok) {
            alert(data.message);
            loadProducts();      // Refresh the product stock immediately
            loadOrdersHistory(); // Refresh the table
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (err) {
        console.error("Void error:", err);
        alert("A network error occurred while voiding the order.");
    }
}

// --- PAYMENT MODAL & CALCULATOR ---
function openPaymentModal() {
    if (cartTotalValue <= 0) return alert("Add items to cart first!");
    
    document.getElementById('modalTotalDue').innerText = `₹${cartTotalValue.toFixed(2)}`;
    setPayMethod('cash'); // Default
    
    const modal = document.getElementById('paymentModal');
    const content = document.getElementById('paymentModalContent');
    
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    const content = document.getElementById('paymentModalContent');
    
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

function setPayMethod(method) {
    currentPayMethod = method;
    
    ['cash', 'upi', 'split'].forEach(m => {
        const btn = document.getElementById(`btn-${m}`);
        if(btn) btn.className = `flex-1 py-2 rounded-lg font-bold text-sm transition-all ${m === method ? 'bg-white text-gray-800 shadow-sm shadow-gray-200' : 'text-gray-500 hover:text-gray-800'}`;
    });

    const inputsDiv = document.getElementById('paymentInputs');
    
    if (method === 'cash') {
        inputsDiv.innerHTML = `
            <div>
                <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Cash Received</label>
                <input type="number" id="cashReceived" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 text-xl font-bold focus:outline-none focus:border-pink-300" placeholder="0" oninput="calculateChange()">
            </div>
            <div class="mt-4 p-4 rounded-xl bg-green-50 border border-green-200 flex justify-between items-center">
                <span class="text-sm font-bold text-green-600 uppercase tracking-wider">Change to Return</span>
                <span id="changeReturn" class="text-3xl font-black text-green-500">₹0.00</span>
            </div>
        `;
        setTimeout(() => {
            const cr = document.getElementById('cashReceived');
            if(cr) cr.focus();
        }, 100);
    } 
    else if (method === 'upi') {
        inputsDiv.innerHTML = `
            <div class="text-center p-6 bg-gray-50 rounded-xl border border-gray-200">
                <p class="text-3xl mb-2">📱</p>
                <p class="text-gray-700 font-black">Ask customer to scan QR code.</p>
                <p class="text-sm text-gray-500 font-medium mt-1">Confirm payment received in bank app.</p>
            </div>
        `;
    } 
    else if (method === 'split') {
        inputsDiv.innerHTML = `
            <div class="flex gap-4">
                <div class="flex-1">
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Cash Part</label>
                    <input type="number" id="splitCash" class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 text-xl font-bold focus:outline-none focus:border-pink-300" placeholder="0" oninput="calculateSplit()">
                </div>
                <div class="flex-1">
                    <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">UPI Part</label>
                    <input type="number" id="splitUpi" class="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-pink-500 text-xl font-bold focus:outline-none" readonly>
                </div>
            </div>
        `;
    }
}

function calculateChange() {
    const received = parseFloat(document.getElementById('cashReceived').value) || 0;
    const change = received - cartTotalValue;
    const changeEl = document.getElementById('changeReturn');
    
    if (change > 0) {
        changeEl.innerText = `₹${change.toFixed(2)}`;
    } else {
        changeEl.innerText = `₹0.00`;
    }
}

function calculateSplit() {
    const cashPart = parseFloat(document.getElementById('splitCash').value) || 0;
    const upiPart = cartTotalValue - cashPart;
    document.getElementById('splitUpi').value = upiPart > 0 ? upiPart.toFixed(2) : 0;
}

async function processCheckout() {
    const activeOrder = ordersState.find(o => o.id === activeOrderId);
    const btn = document.getElementById('confirmPayBtn');
    
    let paymentPayload = { method: currentPayMethod, cash_amount: 0, upi_amount: 0, change_returned: 0 };

    if (currentPayMethod === 'cash') {
        const received = parseFloat(document.getElementById('cashReceived').value) || 0;
        if (received < cartTotalValue) return alert("Insufficient cash received!");
        paymentPayload.cash_amount = cartTotalValue; 
        paymentPayload.change_returned = received - cartTotalValue;
    } 
    else if (currentPayMethod === 'upi') {
        paymentPayload.upi_amount = cartTotalValue;
    } 
    else if (currentPayMethod === 'split') {
        const cashPart = parseFloat(document.getElementById('splitCash').value) || 0;
        const upiPart = parseFloat(document.getElementById('splitUpi').value) || 0;
        if ((cashPart + upiPart) < cartTotalValue) return alert("Split amounts do not equal total!");
        paymentPayload.cash_amount = cashPart;
        paymentPayload.upi_amount = upiPart;
    }

    btn.innerText = "PROCESSING...";
    btn.disabled = true;

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: activeOrder.items, payment: paymentPayload })
        });

        if (response.ok) {
            closePaymentModal();
            ordersState = ordersState.filter(o => o.id !== activeOrderId);
            if(ordersState.length === 0) {
                orderCounter++;
                ordersState.push({ id: orderCounter, name: `Tab #${orderCounter}`, items: [] });
            }
            activeOrderId = ordersState[0].id;
            
            renderTabs();
            renderCart();
            loadProducts();      // Refresh grid stock
            loadOrdersHistory(); // Update bottom history table instantly
            
            setTimeout(() => alert("Payment Successful! Receipt Printed."), 300);
        } else {
            const data = await response.json();
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        console.error(error);
        alert("Checkout failed.");
    } finally {
        btn.innerText = "CONFIRM & PRINT BILL";
        btn.disabled = false;
    }
}