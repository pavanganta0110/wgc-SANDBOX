"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Plus, ChevronDown, UserSquare2 } from "lucide-react";

interface Person {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  ministryOrDepartment: string | null;
  publicDescription: string | null;
  profileImageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
}

export default function PeopleManager({ initialPeople }: { initialPeople: Person[] }) {
  const [people, setPeople] = useState(initialPeople);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleToggleActive = async (person: Person) => {
    const res = await fetch(`/api/merchant/giving-pages/people/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !person.isActive }),
    });
    if (!res.ok) {
      toast.error("Failed to update person");
      return;
    }
    const { person: updated } = await res.json();
    setPeople((prev) => prev.map((p) => (p.id === person.id ? updated : p)));
    toast.success(updated.isActive ? "Person activated" : "Person deactivated");
  };

  const handleDelete = async (person: Person) => {
    if (!confirm(`Delete "${person.displayName}"? This cannot be undone and will fail if they are linked to existing donations.`)) return;
    const res = await fetch(`/api/merchant/giving-pages/people/${person.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data?.error || "Failed to delete person");
      return;
    }
    setPeople((prev) => prev.filter((p) => p.id !== person.id));
    toast.success("Person deleted");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">People</h3>
        <button
          onClick={() => setCreating((c) => !c)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#eab308] text-sm font-bold text-slate-900"
        >
          <Plus className="w-4 h-4" />
          Add Person
        </button>
      </div>

      {creating && (
        <PersonForm
          onCancel={() => setCreating(false)}
          onSaved={(person) => {
            setPeople((prev) => [...prev, person]);
            setCreating(false);
          }}
        />
      )}

      <div className="space-y-3">
        {people.length === 0 && !creating && (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <UserSquare2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-900">No people added yet</p>
            <p className="text-xs text-slate-500 mt-1">Add people to include them on your Person Giving Pages.</p>
          </div>
        )}

        {people.map((person) => (
          <div key={person.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-4">
                {person.profileImageUrl ? (
                  <img src={person.profileImageUrl} alt={person.displayName} className="w-10 h-10 rounded-full object-cover bg-slate-100" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <UserSquare2 className="w-5 h-5 text-slate-400" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{person.displayName}</p>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        person.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {person.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {person.title || "No title"} {person.ministryOrDepartment && `• ${person.ministryOrDepartment}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingId(editingId === person.id ? null : person.id)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Edit
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${editingId === person.id ? "rotate-180" : ""}`} />
                </button>
                <button
                  onClick={() => handleToggleActive(person)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    person.isActive ? "border border-slate-200 text-slate-700 hover:bg-slate-50" : "bg-slate-900 text-white"
                  }`}
                >
                  {person.isActive ? "Deactivate" : "Activate"}
                </button>
                <button
                  onClick={() => handleDelete(person)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
            {editingId === person.id && (
              <div className="border-t border-slate-100 px-5 py-4">
                <PersonForm
                  person={person}
                  onCancel={() => setEditingId(null)}
                  onSaved={(updated) => {
                    setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
                    setEditingId(null);
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PersonForm({
  person,
  onCancel,
  onSaved,
}: {
  person?: Person;
  onCancel: () => void;
  onSaved: (person: Person) => void;
}) {
  const [displayName, setDisplayName] = useState(person?.displayName || "");
  const [firstName, setFirstName] = useState(person?.firstName || "");
  const [lastName, setLastName] = useState(person?.lastName || "");
  const [title, setTitle] = useState(person?.title || "");
  const [ministryOrDepartment, setMinistryOrDepartment] = useState(person?.ministryOrDepartment || "");
  const [publicDescription, setPublicDescription] = useState(person?.publicDescription || "");
  const [profileImageUrl, setProfileImageUrl] = useState(person?.profileImageUrl || "");
  const [displayOrder, setDisplayOrder] = useState(person?.displayOrder || 0);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast.error("Display Name is required");
      return;
    }
    setSaving(true);
    const payload = {
      displayName,
      firstName,
      lastName,
      title,
      ministryOrDepartment,
      publicDescription,
      profileImageUrl,
      displayOrder: Number(displayOrder),
    };

    const res = await fetch(person ? `/api/merchant/giving-pages/people/${person.id}` : "/api/merchant/giving-pages/people", {
      method: person ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      toast.error(data?.error || "Failed to save person");
      return;
    }
    const data = await res.json();
    toast.success("Person saved");
    onSaved(data.person);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Display Name *</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. John Doe, The Smith Family"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
          />
          <p className="text-[10px] text-slate-400 mt-1">This is exactly how their name will appear to donors.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Profile Image URL</label>
          <input
            value={profileImageUrl}
            onChange={(e) => setProfileImageUrl(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">First Name</label>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Last Name</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Youth Pastor, Missionary"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5">Ministry / Department</label>
          <input
            value={ministryOrDepartment}
            onChange={(e) => setMinistryOrDepartment(e.target.value)}
            placeholder="e.g. Youth Ministry"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Public Description</label>
        <textarea
          value={publicDescription}
          onChange={(e) => setPublicDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Display Order</label>
        <input
          type="number"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
          className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
        />
      </div>
      
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-[#eab308] text-sm font-bold text-slate-900 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
