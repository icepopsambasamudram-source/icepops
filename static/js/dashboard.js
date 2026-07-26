let trendChartInstance = null;
let paymentChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    setDashFilter('today');
});

// --- DATE FILTER LOGIC ---
function setDashFilter(rangeType) {
    const today = new Date();
    let start = new Date(today);
    let end = new Date(today);

    // Reset Buttons to frosted glass theme
    document.querySelectorAll('.dash-filter-btn').forEach(btn => {
        btn.className = "dash-filter-btn px-5 py-2.5 rounded-2xl font-bold text-sm bg-white/60 text-gray-500 hover:bg-white border border-pink-100 whitespace-nowrap transition-all shadow-sm";
    });
    
    if (rangeType !== 'custom') {
        const activeBtn = document.getElementById(`btn-${rangeType}`);
        if(activeBtn) activeBtn.className = "dash-filter-btn px-5 py-2.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-pink-400 to-pink-500 text-white shadow-md shadow-pink-200 whitespace-nowrap transition-all";
    }

    if (rangeType === 'yesterday') {
        start.setDate(today.getDate() - 1);
        end.setDate(today.getDate() - 1);
    } else if (rangeType === 'week') {
        const firstDay = today.getDate() - today.getDay();
        start.setDate(firstDay);
    } else if (rangeType === 'month') {
        start.setDate(1);
    } else if (rangeType === 'year') {
        start.setMonth(0, 1);
    } else if (rangeType === 'custom') {
        const customStart = document.getElementById('dashCustomStart').value;
        const customEnd = document.getElementById('dashCustomEnd').value;
        if (!customStart || !customEnd) return alert("Please select both dates.");
        start = new Date(customStart);
        end = new Date(customEnd);
    }

    const startStr = start.toISOString().split('T')[0] + "T00:00:00Z";
    const endStr = end.toISOString().split('T')[0] + "T23:59:59Z";

    fetchDashboardData(startStr, endStr);
}

// --- API FETCH & UPDATE ---
async function fetchDashboardData(start, end) {
    try {
        const response = await fetch(`/api/dashboard/stats?start=${start}&end=${end}`);
        const data = await response.json();
        
        if (response.ok) {
            updateDashboardUI(data);
        }
    } catch (error) {
        console.error("Failed to fetch dashboard data.", error);
    }
}

function updateDashboardUI(data) {
    // 1. Update Sales KPIs
    document.getElementById('dashMetricRevenue').innerText = `₹${data.kpis.revenue.toFixed(2)}`;
    document.getElementById('dashMetricOrders').innerText = data.kpis.orders;
    document.getElementById('dashMetricProducts').innerText = data.kpis.products_sold;
    
    // 2. Update Inventory Overview
    document.getElementById('dashInvValue').innerText = `₹${data.kpis.inventory.total_value.toFixed(2)}`;
    document.getElementById('dashInvItems').innerText = data.kpis.inventory.total_items;
    document.getElementById('dashInvLow').innerText = data.kpis.inventory.low_stock;

    // 3. Render Charts
    renderCharts(data.charts.trend, data.kpis.payments);

    // 4. Render Top Items
    const topItemsList = document.getElementById('dashTopItemsList');
    topItemsList.innerHTML = '';
    if (data.charts.top_products.length === 0) {
        topItemsList.innerHTML = '<li class="text-gray-500 text-sm font-bold text-center mt-4">No sales data in this period.</li>';
    } else {
        const maxQty = Math.max(...data.charts.top_products.map(p => p.quantity_sold));
        
        data.charts.top_products.forEach(item => {
            const width = Math.max((item.quantity_sold / maxQty) * 100, 10);
            topItemsList.innerHTML += `
                <li class="mb-3">
                    <div class="flex justify-between text-sm font-bold text-gray-800 mb-1">
                        <span>${item._id}</span>
                        <span>${item.quantity_sold} Sold <span class="text-gray-400 text-[10px] ml-1">(₹${item.revenue_generated.toFixed(2)})</span></span>
                    </div>
                    <div class="w-full bg-pink-50 rounded-full h-2.5">
                        <div class="bg-gradient-to-r from-pink-400 to-purple-400 h-2.5 rounded-full" style="width: ${width}%"></div>
                    </div>
                </li>
            `;
        });
    }

    // 5. Render Recent Orders
    const recentOrdersList = document.getElementById('dashRecentOrdersList');
    recentOrdersList.innerHTML = '';
    if (data.tables.recent_orders.length === 0) {
        recentOrdersList.innerHTML = '<tr><td colspan="4" class="py-6 text-gray-500 text-sm font-bold text-center">No recent transactions.</td></tr>';
    } else {
        data.tables.recent_orders.forEach(order => {
            const dateStr = new Date(order.created_at.$date || order.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            let methodBadge = '';
            if (order.payment_method === 'cash') methodBadge = '<span class="bg-green-100 border border-green-200 text-green-600 px-2 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase shadow-sm">CASH</span>';
            else if (order.payment_method === 'upi') methodBadge = '<span class="bg-blue-100 border border-blue-200 text-blue-600 px-2 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase shadow-sm">UPI</span>';
            else methodBadge = '<span class="bg-purple-100 border border-purple-200 text-purple-600 px-2 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase shadow-sm">SPLIT</span>';

            recentOrdersList.innerHTML += `
                <tr class="hover:bg-white/60 transition-colors">
                    <td class="py-3 font-black text-pink-500 text-sm">${order.order_number}</td>
                    <td class="py-3 text-sm font-bold text-gray-500">${dateStr}</td>
                    <td class="py-3">${methodBadge}</td>
                    <td class="py-3 text-right font-black text-gray-800">₹${order.total_amount.toFixed(2)}</td>
                </tr>
            `;
        });
    }
}

function renderCharts(trendData, paymentsData) {
    Chart.defaults.color = '#6b7280'; 
    Chart.defaults.font.family = "'Poppins', sans-serif";

    // --- Line Chart (Trend) ---
    const trendCtx = document.getElementById('trendChart').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy();

    const labels = trendData.map(d => d._id);
    const amounts = trendData.map(d => d.daily_revenue);

    trendChartInstance = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Revenue (₹)',
                data: amounts,
                borderColor: '#ec4899', // Pink
                backgroundColor: 'rgba(236, 72, 153, 0.2)',
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#ec4899',
                pointBorderWidth: 2,
                pointRadius: 5,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });

    // --- Pie Chart (Payments) ---
    const paymentCtx = document.getElementById('paymentChart').getContext('2d');
    if (paymentChartInstance) paymentChartInstance.destroy();

    paymentChartInstance = new Chart(paymentCtx, {
        type: 'doughnut',
        data: {
            labels: ['Cash', 'UPI', 'Split'],
            datasets: [{
                data: [paymentsData.cash, paymentsData.upi, paymentsData.split],
                backgroundColor: ['#4ade80', '#60a5fa', '#c084fc'], // Light Green, Blue, Purple
                borderWidth: 2,
                borderColor: '#fff',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { position: 'bottom', labels: { font: { weight: 'bold' } } }
            }
        }
    });
}