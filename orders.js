// =============================
// Supabase Initialization
// =============================
const SUPABASE_URL = "https://dqnmbayimyiuqfzdalox.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxbm1iYXlpbXlpdXFmemRhbG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5OTIwOTYsImV4cCI6MjA3MDU2ODA5Nn0.XPsThMYTgbUX4JU743QhdDwPvVMcPZ1_3OBvMMGW5o4";

const STATUSES = ["pending", "preparing", "paid", "completed", "cancelled"];
let ordersCache = {};

// =============================
// 1. TABS & SETUP
// =============================
document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tab");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach((tab) => {
    tab.onclick = function (e) {
      e.preventDefault();
      tabButtons.forEach((t) => t.classList.remove("active"));
      this.classList.add("active");

      tabContents.forEach((c) => c.classList.remove("active"));
      const target = this.getAttribute("data-target");
      const targetEl = document.getElementById(target);
      if (targetEl) targetEl.classList.add("active");
    };
  });

  if (typeof window.supabase === "undefined") {
    document.getElementById("currentOrdersBody").innerHTML =
      `<tr><td colspan="6" style="text-align:center;color:red;">Error: Supabase SDK failed to load.</td></tr>`;
    return;
  }

  loadOrders();
});

// =============================
// Helpers
// =============================
function notify(message, type = "error") {
  const el = document.getElementById("notification");
  if (el) {
    el.textContent = message;
    el.className = `notification ${type}`;
    setTimeout(() => {
      el.className = "notification";
    }, 3000);
  } else {
    alert(message);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isToday(dateString) {
  if (!dateString) return false;
  const d = new Date(dateString);
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

// =============================
// 2. Load Orders
// =============================
async function loadOrders() {
  const currentBody = document.getElementById("currentOrdersBody");
  const historyBody = document.getElementById("historyOrdersBody");

  if (!currentBody || !historyBody) return;

  currentBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem">Fetching orders…</td></tr>`;
  historyBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem">Fetching orders…</td></tr>`;

  try {
    const supabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
    );

    // --- STEP 1: Fetch Orders ---
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (ordersError)
      throw new Error("Orders query failed: " + ordersError.message);

    if (!orders || orders.length === 0) {
      currentBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No orders found.</td></tr>`;
      historyBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No orders found.</td></tr>`;
      return;
    }

    // --- STEP 2: Fetch Order Items ---
    const orderIds = orders.map((o) => o.id);
    let orderItems = [];
    try {
      const res = await supabase
        .from("order_items")
        .select("*, menu(name)")
        .in("order_id", orderIds);
      if (res.data) orderItems = res.data;
    } catch (e) {
      console.warn("Items fetch failed:", e);
    }

    const itemsByOrderId = {};
    if (orderItems && orderItems.length > 0) {
      orderItems.forEach((item) => {
        if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = [];
        itemsByOrderId[item.order_id].push(item);
      });
    }

    // --- STEP 3: Fetch Users (Foreign Key Join) ---
    const userIds = [...new Set(orders.map((o) => o.user_id).filter(Boolean))];
    let userMap = {};

    if (userIds.length > 0) {
      try {
        const res = await supabase
          .from("users")
          .select("id, username")
          .in("id", userIds);

        if (res.data) {
          res.data.forEach((u) => (userMap[u.id] = u.username));
        }
      } catch (e) {
        console.warn("Users fetch failed:", e);
      }
    }

    // --- STEP 4: Merge Data into Cache ---
    ordersCache = {};
    orders.forEach((o) => {
      let displayName = "Guest";
      if (o.user_id) {
        displayName = userMap[o.user_id] || `User #${o.user_id}`;
      }

      ordersCache[o.id] = {
        ...o,
        username: displayName,
        items: itemsByOrderId[o.id] || [],
      };
    });

    // --- STEP 5: Split by Today/History & Render ---
    // FIX: We map the orders to our enriched cache here!
    const currentOrders = orders
      .filter((o) => isToday(o.created_at))
      .map((o) => ordersCache[o.id]);

    const historicOrders = orders
      .filter((o) => !isToday(o.created_at))
      .map((o) => ordersCache[o.id]);

    renderTable(currentBody, currentOrders, true);
    renderTable(historyBody, historicOrders, false);
  } catch (err) {
    console.error("Fatal error loading orders:", err);
    currentBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Error: ${err.message}</td></tr>`;
    historyBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Error: ${err.message}</td></tr>`;
  }
}

// =============================
// Render Table
// =============================
function renderTable(tbody, orders, isCurrentTab) {
  if (orders.length === 0) {
    const msg = isCurrentTab
      ? "No orders for today yet."
      : "No previous orders found.";
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:#777;">${msg}</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  orders.forEach((order) => {
    const total = Number(order.total || 0).toFixed(2);
    const dateStr = new Date(order.created_at).toLocaleString();

    const statusOptions = STATUSES.map(
      (v) =>
        `<option value="${v}" ${order.status === v ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`,
    ).join("");

    const statusHtml = `
      <select class="status-select" data-id="${order.id}" data-prev="${escapeHtml(order.status)}">
        ${statusOptions}
      </select>`;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>#${order.id}</td>
      <td><strong>${escapeHtml(order.username)}</strong></td>
      <td>${statusHtml}</td>
      <td>R${total}</td>
      <td>${dateStr}</td>
      <td>
        <button class="action-btn" onclick="openReceipt(${order.id})" style="color:#3498db; border-color:#3498db;">Receipt</button>
        ${!isCurrentTab ? `<button class="action-btn delete" onclick="deleteOrder(${order.id})">Delete</button>` : ""}
      </td>
    `;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", async (e) => {
      const el = e.target;
      const id = Number(el.getAttribute("data-id"));
      const newStatus = el.value;
      const prev = el.getAttribute("data-prev");

      const ok = await updateStatus(id, newStatus);
      if (ok) {
        el.setAttribute("data-prev", newStatus);
      } else {
        el.value = prev;
      }
    });
  });
}

// =============================
// Receipt Modal Logic
// =============================
function openReceipt(orderId) {
  const order = ordersCache[orderId];
  if (!order) return;

  document.getElementById("rcpOrderId").textContent = order.id;
  document.getElementById("rcpDate").textContent = new Date(
    order.created_at,
  ).toLocaleString();
  document.getElementById("rcpCustomer").textContent = order.username;
  document.getElementById("rcpStatus").textContent = (
    order.status || "pending"
  ).toUpperCase();
  document.getElementById("rcpTotal").textContent = Number(
    order.total || 0,
  ).toFixed(2);

  const itemsBody = document.getElementById("rcpItemsBody");
  itemsBody.innerHTML = order.items
    .map((item) => {
      const name = item.menu?.name || "Deleted Item";
      const price = Number(item.price || 0).toFixed(2);
      return `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td>x${item.quantity}</td>
        <td>R${price}</td>
      </tr>
    `;
    })
    .join("");

  document.getElementById("receiptModal").style.display = "flex";
}

function closeReceipt() {
  document.getElementById("receiptModal").style.display = "none";
}

window.addEventListener("click", (e) => {
  const modal = document.getElementById("receiptModal");
  if (e.target === modal) closeReceipt();
});

// =============================
// Update & Delete Functions
// =============================
async function updateStatus(orderId, newStatus) {
  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );
  const { error } = await supabase
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId);

  if (error) {
    notify("Failed to update status: " + error.message);
    return false;
  }
  notify("Status updated", "success");
  return true;
}

async function deleteOrder(orderId) {
  const msg =
    "Are you sure you want to delete this historic order?\n\nWARNING: This will permanently delete the order items and payment records.";
  if (!confirm(msg)) return;

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );
  await supabase.from("order_items").delete().eq("order_id", orderId);
  const { error } = await supabase.from("orders").delete().eq("id", orderId);

  if (error) {
    notify("Failed to delete order: " + error.message);
  } else {
    notify("Order deleted", "success");
    loadOrders();
  }
}
