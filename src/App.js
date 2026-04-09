import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import "./App.css";

const api = axios.create({
  baseURL: "http://localhost:8000",
});

// Custom hook for auto-dismiss messages/errors
const useAutoTimeout = (value, setValue, delayMs = 5000) => {
  useEffect(() => {
    if (value) {
      const timer = setTimeout(() => setValue(""), delayMs);
      return () => clearTimeout(timer);
    }
  }, [value, setValue, delayMs]);
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

  // Auto-dismiss messages and errors
  useAutoTimeout(message, setMessage);
  useAutoTimeout(error, setError);

  // Fetch all medicines
  const fetchMedicine = async () => {
    setLoading(true);
    try {
      const res = await api.get("/medicines/");
      setMedicines(res.data);
      setError("");
    } catch (err) {
      setError("Failed to fetch medicines");
    }
    setLoading(false);
  };

  const refreshAllData = async () => {
    await Promise.all([
      fetchMedicine(),
      fetchLowStockAlerts(),
      fetchExpiredAlerts(),
      fetchExpiringSoonAlerts(),
    ]);
  };

  useEffect(() => {
    // Inline initial fetch to avoid referencing external deps
    const run = async () => {
      try {
        await refreshAllData();
        setError("");
      } catch (err) {
        setError("Failed to fetch medicines");
      }
    };
    run();
  }, []);

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
    () => new Set(lowStockAlerts.map((a) => a.id)),
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
    if (new Date(form.expiry_date) < new Date()) {
      setError("Expiry date cannot be in the past");
      return false;
    }
    return true;
  };

  // Derived list with filter and sorting
  const filteredMedicines = useMemo(() => {
    let filtered = medicines;

    // Apply filter
    const q = filter.trim().toLowerCase();
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
    filter,
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
        await api.put(`/medicines/${editId}`, payload);
        setMessage("Medicine updated successfully");
      } else {
        await api.post("/medicines/", payload);
        setMessage("Medicine created successfully");
      }
      resetForm();
      await refreshAllData();
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
      await refreshAllData();
    } catch (err) {
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
    fetchAlerts("expiring-soon", setExpiringSoonAlerts, { days: 30 });

  const currency = (n) =>
    typeof n === "number" ? n.toFixed(2) : Number(n || 0).toFixed(2);

  return (
    <div className="app-bg">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">📦</span>
          <h1>Telusko Trac</h1>
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
        <div className="stats">
          <div className="chip">Total: {medicines.length}</div>
          <div className="search">
            <input
              type="text"
              placeholder="Search by id, name or description..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="status-filter">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Medicines</option>
              <option value="expired">Expired</option>
              <option value="low_stock">Low Stock</option>
              <option value="expiring_soon">Expiring Soon</option>
            </select>
          </div>
        </div>

        <div className="content-grid">
          <div className="card form-card">
            <h2>{editId ? "Edit Medicine" : "Add Medicine"}</h2>
            <form onSubmit={handleSubmit} className="medicine-form">
              <input
                type="text"
                name="name"
                placeholder="Name"
                value={form.name}
                onChange={handleChange}
                required
              />
              <input
                type="text"
                name="description"
                placeholder="Description"
                value={form.description}
                onChange={handleChange}
                required
              />
              <input
                type="text"
                name="category"
                placeholder="Category"
                value={form.category}
                onChange={handleChange}
                required
              />
              <input
                type="text"
                name="batch_no"
                placeholder="Batch Number"
                value={form.batch_no}
                onChange={handleChange}
                required
              />
              <input
                type="number"
                name="price"
                placeholder="Price"
                value={form.price}
                onChange={handleChange}
                required
                step="0.01"
              />
              <input
                type="number"
                name="quantity"
                placeholder="Quantity"
                value={form.quantity}
                onChange={handleChange}
                required
              />
              <input
                type="number"
                name="min_stock"
                placeholder="Minimum Stock"
                value={form.min_stock}
                onChange={handleChange}
                required
              />
              <input
                type="date"
                name="expiry_date"
                value={form.expiry_date}
                onChange={handleChange}
                required
              />
              <div className="form-actions">
                <button className="btn" type="submit" disabled={loading}>
                  {editId ? "Update" : "Add"}
                </button>
                {editId && (
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      resetForm();
                      setMessage("");
                      setError("");
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
            {message && <div className="success-msg">{message}</div>}
            {error && <div className="error-msg">{error}</div>}
          </div>

          <div className="card list-card">
            <h2>Medicines</h2>
            <div className="alerts-grid">
              <div className="alert-card alert-low">
                <h4>Low Stock</h4>
                <p>{lowStockAlerts.length} medicines</p>
              </div>
              <div className="alert-card alert-expired">
                <h4>Expired</h4>
                <p>{expiredAlerts.length} medicines</p>
              </div>
              <div className="alert-card alert-soon">
                <h4>Expiring Soon (30 days)</h4>
                <p>{expiringSoonAlerts.length} medicines</p>
              </div>
            </div>
            {loading ? (
              <div className="loader">Loading...</div>
            ) : (
              <div className="scroll-x">
                <table className="medicine-table">
                  <thead>
                    <tr>
                      <th
                        className={`sortable ${sortField === "id" ? `sort-${sortDirection}` : ""}`}
                        onClick={() => handleSort("id")}
                      >
                        ID
                      </th>
                      <th
                        className={`sortable ${sortField === "name" ? `sort-${sortDirection}` : ""}`}
                        onClick={() => handleSort("name")}
                      >
                        Name
                      </th>
                      <th
                        className={`sortable ${sortField === "price" ? `sort-${sortDirection}` : ""}`}
                        onClick={() => handleSort("price")}
                      >
                        Price
                      </th>
                      <th
                        className={`sortable ${sortField === "quantity" ? `sort-${sortDirection}` : ""}`}
                        onClick={() => handleSort("quantity")}
                      >
                        Quantity
                      </th>
                      <th>Expiration Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMedicines.map((medicine) => (
                      <tr
                        key={medicine.id}
                        className={
                          expiredIds.has(medicine.id)
                            ? "row-expired"
                            : lowStockIds.has(medicine.id)
                              ? "row-low-stock"
                              : expiringSoonIds.has(medicine.id)
                                ? "row-expiring-soon"
                                : ""
                        }
                      >
                        <td>{medicine.id}</td>
                        <td className="name-cell">{medicine.name}</td>
                        <td className="price-cell">
                          ${currency(medicine.price)}
                        </td>
                        <td>
                          <span className="qty-badge">{medicine.quantity}</span>
                        </td>
                        <td>
                          {medicine.expiry_date
                            ? String(medicine.expiry_date).slice(0, 10)
                            : "N/A"}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="btn btn-edit"
                              onClick={() => handleEdit(medicine)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-delete"
                              onClick={() => handleDelete(medicine.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredMedicines.length === 0 && (
                      <tr>
                        <td colSpan={6} className="empty">
                          No medicines found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
