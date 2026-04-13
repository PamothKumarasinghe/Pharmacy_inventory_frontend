import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import "./App.css";

const api = axios.create({
  baseURL: "http://localhost:8000",
});

const MESSAGE_DISMISS_DELAY = 5000;
const DEFAULT_EXPIRING_DAYS = 30;

// Custom hook for auto-dismiss messages/errors
const useAutoTimeout = (value, setValue, delayMs = MESSAGE_DISMISS_DELAY) => {
  useEffect(() => {
    if (value) {
      const timer = setTimeout(() => setValue(""), delayMs);
      return () => clearTimeout(timer);
    }
  }, [value, setValue, delayMs]);
};

const useDebounce = (value, delayMs = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
};

function App() {
  const [medicines, setMedicines] = useState([]);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "",
    batch_no: "",
    price: "",
    quantity: "",
    min_stock: "10",
    expiry_date: "",
  });

  const [editId, setEditId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState("id");
  const [sortDirection, setSortDirection] = useState("asc");

  // alert system
  const [lowStockAlerts, setLowStockAlerts] = useState([]);
  const [expiredAlerts, setExpiredAlerts] = useState([]);
  const [expiringSoonAlerts, setExpiringSoonAlerts] = useState([]);

  // alert filter
  const [statusFilter, setStatusFilter] = useState("all");

  // pagination system
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalMedicines, setTotalMedicines] = useState(0);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);

  // Auto-dismiss messages and errors
  useAutoTimeout(message, setMessage, MESSAGE_DISMISS_DELAY);
  useAutoTimeout(error, setError, MESSAGE_DISMISS_DELAY);
  const debouncedFilter = useDebounce(filter);

  // Fetch all medicines
  const fetchMedicine = async (
    currentPage = page,
    currentPageSize = pageSize,
  ) => {
    setLoading(true);
    try {
      const res = await api.get("/medicines/", {
        params: {
          skip: (currentPage - 1) * currentPageSize,
          limit: currentPageSize,
        },
      });
      setMedicines(res.data.items || []);
      setTotalMedicines(res.data.total || 0);
      setError("");
    } catch (err) {
      setError("Failed to fetch medicines");
    }
    setLoading(false);
  };

  const refreshAllData = async () => {
    await Promise.all([fetchMedicine(page, pageSize), refreshAlerts()]);
  };

  // refresh all alerts - created due to avoid refreshAllMedicines after every update/ create
  const refreshAlerts = async () => {
    await Promise.all([
      fetchLowStockAlerts(),
      fetchExpiredAlerts(),
      fetchExpiringSoonAlerts(),
    ]);
  };

  useEffect(() => {
    fetchMedicine(page, pageSize);
  }, [page, pageSize]);

  useEffect(() => {
    refreshAlerts();
  }, []);

  // Reset to first page when filter or status filter changes
  useEffect(() => {
    setPage(1);
  }, [filter, statusFilter]);

  const syncMedicinesFallback = async () => {
    try {
      await fetchMedicine();
    } catch (err) {
      setError("Failed to sync medicines");
    }
  };

  // Handle sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const lowStockIds = useMemo(
    () =>
      new Set(lowStockAlerts.filter((a) => a.quantity > 0).map((a) => a.id)),
    [lowStockAlerts],
  );

  const expiredIds = useMemo(
    () => new Set(expiredAlerts.map((a) => a.id)),
    [expiredAlerts],
  );

  const expiringSoonIds = useMemo(
    () => new Set(expiringSoonAlerts.map((a) => a.id)),
    [expiringSoonAlerts],
  );
  // input validation
  const validateForm = () => {
    if (form.price < 0) {
      setError("Price cannot be negative");
      return false;
    }
    if (form.quantity < 0) {
      setError("Quantity cannot be negative");
      return false;
    }
    const expiryDate = new Date(form.expiry_date);
    const today = new Date();
    expiryDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    if (expiryDate <= today) {
      setError("Expiry date must be after today");
      return false;
    }
    return true;
  };

  // Derived list with filter and sorting
  const filteredMedicines = useMemo(() => {
    let filtered = medicines;

    // Apply filter
    const q = debouncedFilter.trim().toLowerCase();
    if (q) {
      filtered = medicines.filter(
        (medicine) =>
          String(medicine.id).includes(q) ||
          medicine.name?.toLowerCase().includes(q) ||
          medicine.description?.toLowerCase().includes(q),
      );
    }
    // apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((medicine) => {
        if (statusFilter === "low_stock") return lowStockIds.has(medicine.id);
        if (statusFilter === "expired") return expiredIds.has(medicine.id);
        if (statusFilter === "expiring_soon")
          return expiringSoonIds.has(medicine.id);
        return true;
      });
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle numeric fields
      if (
        sortField === "id" ||
        sortField === "price" ||
        sortField === "quantity"
      ) {
        aVal = Number(aVal);
        bVal = Number(bVal);
      } else {
        // Handle string fields
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [
    medicines,
    debouncedFilter,
    sortField,
    sortDirection,
    lowStockIds,
    expiredIds,
    expiringSoonIds,
    statusFilter,
  ]);

  // Handle form input
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Reset form
  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      category: "",
      batch_no: "",
      price: "",
      quantity: "",
      min_stock: "10",
      expiry_date: "",
    });
    setEditId(null);
  };

  const formatApiError = (err) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => d?.msg || "Invalid input").join("; ");
    }
    return "Operation failed";
  };

  // Create or update medicine
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    if (!validateForm()) {
      setLoading(false);
      return;
    }

    const payload = {
      ...form,
      price: Number(form.price),
      quantity: Number(form.quantity),
      min_stock: Number(form.min_stock || 0),
      expiry_date: form.expiry_date,
    };

    try {
      if (editId) {
        const res = await api.put(`/medicines/${editId}`, payload);
        setMessage("Medicine updated successfully");
      } else {
        const res = await api.post("/medicines/", payload);
        setMessage("Medicine created successfully");
      }

      await fetchMedicine(page, pageSize);

      try {
        await refreshAlerts();
      } catch (alertErr) {
        console.error("Mutation succeeded but alert refresh failed", alertErr);
        setError(
          "Saved successfully, but failed to refresh alerts. Click Refresh.",
        );
      }

      resetForm();
      setIsFormModalOpen(false);
    } catch (err) {
      setError(formatApiError(err));
    }

    setLoading(false);
  };

  // Edit medicine
  const handleEdit = (medicine) => {
    setForm({
      name: medicine.name,
      description: medicine.description,
      category: medicine.category || "",
      batch_no: medicine.batch_no || "",
      price: medicine.price,
      quantity: medicine.quantity,
      min_stock: medicine.min_stock ?? "10",
      expiry_date: medicine.expiry_date
        ? String(medicine.expiry_date).slice(0, 10)
        : "",
    });
    setEditId(medicine.id);
    setIsFormModalOpen(true);
    setMessage("");
    setError("");
  };

  // Delete medicine
  const handleDelete = async (medicine_id) => {
    const ok = window.confirm("Delete this medicine?");
    if (!ok) return;
    setLoading(true);
    setMessage("");
    setError("");
    try {
      await api.delete(`/medicines/${medicine_id}`);
      setMessage("Medicine deleted successfully");

      const nextTotal = Math.max(totalMedicines - 1, 0);
      const totalPagesAfterDelete = Math.max(
        1,
        Math.ceil(nextTotal / pageSize),
      );
      const nextPage = Math.min(page, totalPagesAfterDelete);

      if (nextPage !== page) {
        setPage(nextPage);
      } else {
        await fetchMedicine(nextPage, pageSize);
      }

      try {
        await refreshAlerts();
      } catch (alertErr) {
        console.error("Delete succeeded but alert refresh failed", alertErr);
        setError(
          "Deleted successfully, but failed to refresh alerts. Click Refresh.",
        );
      }
    } catch (err) {
      await syncMedicinesFallback();
      setError("Delete failed");
    }

    setLoading(false);
  };

  // Generic alert fetch function
  const fetchAlerts = async (endpoint, setState, params = {}) => {
    try {
      const res = await api.get(`/medicines/alerts/${endpoint}`, {
        params,
      });
      setState(res.data?.alerts || []);
    } catch (err) {
      console.error(`Failed to fetch ${endpoint} alerts`);
    }
  };

  const fetchLowStockAlerts = () => fetchAlerts("low-stock", setLowStockAlerts);
  const fetchExpiredAlerts = () => fetchAlerts("expired", setExpiredAlerts);
  const fetchExpiringSoonAlerts = () =>
    fetchAlerts("expiring-soon", setExpiringSoonAlerts, {
      days: DEFAULT_EXPIRING_DAYS,
    });

  const currency = (n) =>
    typeof n === "number" ? n.toFixed(2) : Number(n || 0).toFixed(2);

  const handleAddItemClick = () => {
    resetForm();
    setIsFormModalOpen(true);
  };

  const closeFormModal = () => {
    setIsFormModalOpen(false);
    resetForm();
    setMessage("");
    setError("");
  };

  const getMedicineStatus = (medicine) => {
    if (medicine.quantity <= 0) return "Out of Stock";
    if (expiredIds.has(medicine.id)) return "Expired";
    if (lowStockIds.has(medicine.id)) return "Low Stock";
    if (expiringSoonIds.has(medicine.id)) return "Expiring Soon";
    return "Normal";
  };

  const getStatusClass = (medicine) => {
    if (medicine.quantity <= 0) return "status-out";
    if (expiredIds.has(medicine.id)) return "status-expired";
    if (lowStockIds.has(medicine.id)) return "status-low";
    if (expiringSoonIds.has(medicine.id)) return "status-expiring";
    return "status-normal";
  };

  const getRowClass = (id) => {
    if (expiredIds.has(id)) return "row-expired";
    if (lowStockIds.has(id)) return "row-low-stock";
    if (expiringSoonIds.has(id)) return "row-expiring-soon";
    return "";
  };

  return (
    <div className="app-bg">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">📦</span>
          <h1>Pharmacy Inventory</h1>
        </div>
        <div className="top-actions">
          <button
            className="btn btn-light"
            onClick={refreshAllData}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="container">
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Total Items</div>
            <div className="metric-value">{totalMedicines}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Low Stock</div>
            <div className="metric-value warning">
              {lowStockAlerts.filter((a) => a.quantity > 0).length}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Expiring Soon</div>
            <div className="metric-value warning">
              {expiringSoonAlerts.length}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Expired</div>
            <div className="metric-value danger">{expiredAlerts.length}</div>
          </div>
        </div>

        <div className="toolbar-card">
          <div className="toolbar-top">
            <div className="search">
              <input
                type="text"
                placeholder="Search medications..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <button
              className="btn btn-add-item"
              type="button"
              onClick={handleAddItemClick}
            >
              + Add Item
            </button>
          </div>
          <div
            className="filter-tabs"
            role="tablist"
            aria-label="Inventory filters"
          >
            <button
              type="button"
              className={`filter-tab ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-tab ${statusFilter === "low_stock" ? "active" : ""}`}
              onClick={() => setStatusFilter("low_stock")}
            >
              Low Stock
            </button>
            <button
              type="button"
              className={`filter-tab ${statusFilter === "expiring_soon" ? "active" : ""}`}
              onClick={() => setStatusFilter("expiring_soon")}
            >
              Expiring Soon
            </button>
            <button
              type="button"
              className={`filter-tab ${statusFilter === "expired" ? "active" : ""}`}
              onClick={() => setStatusFilter("expired")}
            >
              Expired
            </button>
          </div>
        </div>

        <div className="content-grid">
          <div className="card list-card">
            <h2>Medicines</h2>
            {loading ? (
              <div className="loader">Loading...</div>
            ) : (
              <div className="scroll-x">
                <table className="medicine-table">
                  <thead>
                    <tr>
                      <th
                        className={`sortable ${sortField === "name" ? `sort-${sortDirection}` : ""}`}
                        onClick={() => handleSort("name")}
                      >
                        Medication
                      </th>
                      <th>Category</th>
                      <th
                        className={`sortable ${sortField === "quantity" ? `sort-${sortDirection}` : ""}`}
                        onClick={() => handleSort("quantity")}
                      >
                        Quantity
                      </th>
                      <th>Min Stock</th>
                      <th>Expiration</th>
                      <th>Batch</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMedicines.map((medicine) => (
                      <tr
                        key={medicine.id}
                        className={getRowClass(medicine.id)}
                      >
                        <td className="name-cell text-sm text-neutral-900">
                          {medicine.name}
                        </td>
                        <td className="text-sm text-neutral-900">
                          {medicine.category}
                        </td>
                        <td className="text-sm text-neutral-900">
                          <span
                            className={
                              medicine.quantity < medicine.min_stock
                                ? "text-amber-600"
                                : "text-neutral-900"
                            }
                          >
                            {medicine.quantity}
                          </span>
                        </td>
                        <td className="text-sm text-neutral-900">
                          {medicine.min_stock}
                        </td>
                        <td className="text-sm text-neutral-900">
                          {medicine.expiry_date
                            ? String(medicine.expiry_date)
                                .slice(0, 10)
                                .replaceAll("-", "/")
                            : "N/A"}
                        </td>
                        <td className="text-sm text-neutral-600">
                          {medicine.batch_no}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${getStatusClass(medicine)}`}
                          >
                            {getMedicineStatus(medicine)}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn btn-edit action-icon"
                              onClick={() => handleEdit(medicine)}
                              aria-label="Edit medicine"
                              title="Edit"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <path
                                  d="M15.232 5.232l3.536 3.536M16.732 3.732a2.121 2.121 0 113 3L7 19.5l-4 1 1-4 12.732-12.768z"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                            <button
                              className="btn btn-delete action-icon"
                              onClick={() => handleDelete(medicine.id)}
                              aria-label="Delete medicine"
                              title="Delete"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                focusable="false"
                              >
                                <path
                                  d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredMedicines.length === 0 && (
                      <tr>
                        <td colSpan={8} className="empty">
                          No medicines found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pagination-bar">
              <button
                className="btn btn-secondary"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page === 1 || loading}
              >
                Previous
              </button>

              <span className="page-info">
                Page {page} of{" "}
                {Math.max(1, Math.ceil(totalMedicines / pageSize))}
              </span>

              <button
                className="btn btn-secondary"
                onClick={() =>
                  setPage((prev) => {
                    const totalPages = Math.ceil(totalMedicines / pageSize);
                    return Math.min(prev + 1, totalPages);
                  })
                }
                disabled={
                  page >= Math.ceil(totalMedicines / pageSize) || loading
                }
              >
                Next
              </button>

              <select
                className="page-size-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={5}>5 / page</option>
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
          </div>
        </div>

        {isFormModalOpen && (
          <div className="modal-backdrop" onClick={closeFormModal}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{editId ? "Edit Item" : "Add New Item"}</h3>
                <button
                  type="button"
                  className="modal-close"
                  onClick={closeFormModal}
                  aria-label="Close form"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="modal-form-grid">
                <div className="form-group field-span-2">
                  <label>Name</label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group field-span-2">
                  <label>Description</label>
                  <input
                    type="text"
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <input
                    type="text"
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Batch Number</label>
                  <input
                    type="text"
                    name="batch_no"
                    value={form.batch_no}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Price</label>
                  <input
                    type="number"
                    name="price"
                    value={form.price}
                    onChange={handleChange}
                    required
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label>Quantity</label>
                  <input
                    type="number"
                    name="quantity"
                    value={form.quantity}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Min Stock</label>
                  <input
                    type="number"
                    name="min_stock"
                    value={form.min_stock}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    name="expiry_date"
                    value={form.expiry_date}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="modal-actions field-span-2">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={closeFormModal}
                  >
                    Cancel
                  </button>
                  <button className="btn" type="submit" disabled={loading}>
                    {editId ? "Update Item" : "Add Item"}
                  </button>
                </div>
              </form>

              {message && <div className="success-msg">{message}</div>}
              {error && <div className="error-msg">{error}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
