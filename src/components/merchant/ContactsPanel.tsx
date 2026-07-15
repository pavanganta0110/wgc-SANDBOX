"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

const ROLES = ["PRIMARY", "FINANCE", "TECHNICAL", "SUPPORT", "AUTHORIZED_SIGNER", "STATEMENT", "SECURITY"];
const inputClass = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400";

function roleLabel(role: string): string {
  return role.split("_").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ");
}

export default function ContactsPanel({ initialContacts, canManage }: { initialContacts: Contact[]; canManage: boolean }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("PRIMARY");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const addContact = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/merchant/organization/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role, email: email || undefined, phone: phone || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add contact");
      setContacts((prev) => [...prev, data.contact]);
      setName("");
      setEmail("");
      setPhone("");
      setAdding(false);
      toast.success("Contact added");
    } catch (err: any) {
      toast.error(err.message || "Failed to add contact");
    } finally {
      setSubmitting(false);
    }
  };

  const removeContact = async (contact: Contact) => {
    if (!window.confirm(`Remove ${contact.name}?`)) return;
    try {
      const res = await fetch(`/api/merchant/organization/contacts/${contact.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove contact");
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      toast.success("Contact removed");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove contact");
    }
  };

  return (
    <div>
      {contacts.length === 0 && !adding ? (
        <p className="text-sm text-slate-500 py-4">No contacts added yet.</p>
      ) : (
        <div className="divide-y divide-slate-50 mb-4">
          {contacts.map((contact) => (
            <div key={contact.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{contact.name}</div>
                <div className="text-xs text-slate-500">
                  {roleLabel(contact.role)} {contact.email && `· ${contact.email}`} {contact.phone && `· ${contact.phone}`}
                </div>
              </div>
              {canManage && (
                <button onClick={() => removeContact(contact)} className="text-slate-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage &&
        (adding ? (
          <div className="p-4 bg-slate-50 rounded-xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={inputClass} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input className={inputClass} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className={inputClass} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={addContact} disabled={submitting} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                {submitting ? "Adding…" : "Add Contact"}
              </button>
              <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline">
            <Plus className="w-4 h-4" /> Add Contact
          </button>
        ))}
    </div>
  );
}
