'use client';

import { useState } from 'react';

export default function UpdateForm({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg("");
    const selected = e.target.files?.[0];
    if (!selected) return;

    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(selected.type)) {
      setErrorMsg("Invalid file type. Only JPG, PNG, and PDF are allowed.");
      setFile(null);
      return;
    }

    if (selected.size > 10 * 1024 * 1024) {
      setErrorMsg("File too large. Maximum size is 10MB.");
      setFile(null);
      return;
    }

    setFile(selected);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg("Please select a file to upload.");
      return;
    }

    setUploading(true);
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("file", file);

      const res = await fetch("/api/onboarding/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setErrorMsg(data.error || "Failed to upload document.");
      }
    } catch (err: any) {
      setErrorMsg("An unexpected error occurred. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center p-6 bg-green-50 rounded-xl border border-green-100 mt-6">
        <h3 className="text-lg font-bold text-green-900 mb-2">Upload Successful</h3>
        <p className="text-green-800">
          Your document has been submitted securely. We will notify you once the review is completed.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <div className="mb-6">
        <label className="block text-sm font-bold text-gray-700 mb-2">
          Upload Document (PDF, JPG, PNG)
        </label>
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
          <div className="space-y-1 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
              <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex text-sm text-gray-600 justify-center">
              <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                <span>Upload a file</span>
                <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
              </label>
            </div>
            <p className="text-xs text-gray-500">
              PDF, PNG, JPG up to 10MB
            </p>
          </div>
        </div>
        {file && (
          <div className="mt-3 text-sm text-gray-700 bg-white p-3 rounded shadow-sm border flex items-center justify-between">
            <span className="truncate max-w-[200px] sm:max-w-xs">{file.name}</span>
            <span className="text-gray-500 text-xs">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={!file || uploading}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
      >
        {uploading ? "Uploading Securely..." : "Submit Required Information"}
      </button>
    </form>
  );
}
