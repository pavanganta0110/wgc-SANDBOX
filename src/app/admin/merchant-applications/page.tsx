'use client';

import { useEffect, useState } from 'react';
import IrsLetterReviewModal from '@/components/admin/IrsLetterReviewModal';

interface MerchantDocument {
  id: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  uploadedBy: string;
}

interface Application {
  id: string;
  organizationName: string;
  contactEmail: string;
  finixMerchantId: string | null;
  finixIdentityId: string | null;
  onboardingStatus: string;
  onboardingState: string | null;
  verificationState: string | null;
  lastFinixEventType: string | null;
  lastStatusChangedAt: string | null;
  lastUpdateSubmittedAt: string | null;
  updateRequestedCodes: any;
  updateRequestedItems: string | null;
  rejectionReasonInternal: string | null;
  createdAt: string;
  finixOnboardingFormId: string | null;
  documents: MerchantDocument[];
}

export default function MerchantApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Upload Modal State
  const [uploadModalAppId, setUploadModalAppId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [irsLetterModalApp, setIrsLetterModalApp] = useState<{ id: string; organizationName: string } | null>(null);

  const fetchApps = () => {
    fetch('/api/admin/merchant-applications')
      .then(res => res.json())
      .then(data => {
        setApps(data.applications || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching applications:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const resendEmail = async (appId: string) => {
    if (!confirm("Are you sure you want to resend the latest status email to this merchant?")) return;
    
    try {
      const res = await fetch('/api/admin/resend-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: appId })
      });
      const data = await res.json();
      if (data.success) {
        alert("Email resent successfully!");
      } else {
        alert("Failed to resend email: " + data.error);
      }
    } catch (err) {
      alert("Error resending email.");
    }
  };

  const regenerateToken = async (appId: string) => {
    if (!confirm("Are you sure you want to regenerate the secure link and send it to the merchant?")) return;
    
    setRegenerating(appId);
    try {
      const res = await fetch('/api/admin/regenerate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: appId })
      });
      const data = await res.json();
      if (data.success) {
        alert("Secure link regenerated and sent to merchant.");
        fetchApps();
      } else {
        alert("Failed to regenerate token: " + data.error);
      }
    } catch (err) {
      alert("Error regenerating token.");
    } finally {
      setRegenerating(null);
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadModalAppId) return;

    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("applicationId", uploadModalAppId);
      
      const res = await fetch('/api/admin/upload-evidence', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      
      if (data.success) {
        alert("Document uploaded to Finix successfully!");
        setUploadModalAppId(null);
        setUploadFile(null);
        fetchApps();
      } else {
        alert("Failed to upload: " + data.error);
      }
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading applications...</div>;
  }

  return (
    <div className="p-8 max-w-[90rem] mx-auto">
      <h1 className="text-2xl font-bold mb-8">Merchant Applications</h1>
      
      <div className="overflow-x-auto bg-white rounded-xl shadow">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-4 font-semibold text-gray-900">Business Name</th>
              <th className="px-6 py-4 font-semibold text-gray-900">Status</th>
              <th className="px-6 py-4 font-semibold text-gray-900 w-64">Required Info / Errors</th>
              <th className="px-6 py-4 font-semibold text-gray-900 w-64">Documents</th>
              <th className="px-6 py-4 font-semibold text-gray-900">IRS Letter</th>
              <th className="px-6 py-4 font-semibold text-gray-900">Timestamps</th>
              <th className="px-6 py-4 font-semibold text-gray-900">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {apps.map(app => (
              <tr key={app.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{app.organizationName}</div>
                  <div className="text-gray-500 text-xs mt-1">{app.contactEmail}</div>
                  <div className="text-gray-400 font-mono text-[10px] mt-1" title="Merchant ID">M: {app.finixMerchantId || '-'}</div>
                  <div className="text-gray-400 font-mono text-[10px] mt-0.5" title="Identity ID">I: {app.finixIdentityId || '-'}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold
                    ${app.onboardingStatus === 'APPROVED' ? 'bg-green-100 text-green-800' : 
                      app.onboardingStatus === 'REJECTED' ? 'bg-red-100 text-red-800' : 
                      app.onboardingStatus === 'UNDER_REVIEW' ? 'bg-yellow-100 text-yellow-800' :
                      app.onboardingStatus === 'MORE_INFORMATION_REQUIRED' ? 'bg-orange-100 text-orange-800' :
                      'bg-blue-100 text-blue-800'}`}>
                    {app.onboardingStatus || 'DRAFT'}
                  </span>
                  {app.lastFinixEventType && (
                    <div className="text-[10px] text-gray-400 mt-1 uppercase">{app.lastFinixEventType}</div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs text-red-600">
                    {app.updateRequestedItems ? (
                      <div className="whitespace-pre-wrap">{app.updateRequestedItems}</div>
                    ) : app.updateRequestedCodes ? (
                      <div className="truncate max-w-[200px]" title={JSON.stringify(app.updateRequestedCodes)}>
                        {JSON.stringify(app.updateRequestedCodes)}
                      </div>
                    ) : app.rejectionReasonInternal ? (
                      <span>{app.rejectionReasonInternal}</span>
                    ) : '-'}
                  </div>
                  {app.finixOnboardingFormId && app.onboardingStatus === 'MORE_INFORMATION_REQUIRED' && (
                    <div className="mt-2 text-xs">
                       <a href={`https://dashboard.finix.com/onboarding_forms/${app.finixOnboardingFormId}`} target="_blank" className="text-blue-500 hover:underline font-semibold">
                         Hosted Form Link
                       </a>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {app.documents && app.documents.length > 0 ? (
                    <ul className="space-y-1">
                      {app.documents.map(doc => (
                        <li key={doc.id} className="text-xs text-gray-600 flex justify-between items-center bg-gray-50 p-1 rounded">
                          <span className="truncate max-w-[120px]" title={doc.fileName}>{doc.fileName}</span>
                          <span className="text-[10px] bg-gray-200 px-1 rounded ml-2">{doc.uploadedBy}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => setIrsLetterModalApp({ id: app.id, organizationName: app.organizationName })}
                    className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-700 px-2 py-1.5 rounded transition-colors"
                  >
                    Review
                  </button>
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs space-y-1">
                  <div><strong>Updated:</strong> {app.lastStatusChangedAt ? new Date(app.lastStatusChangedAt).toLocaleString() : '-'}</div>
                  <div><strong>Submitted:</strong> {app.lastUpdateSubmittedAt ? new Date(app.lastUpdateSubmittedAt).toLocaleString() : '-'}</div>
                  <div><strong>Created:</strong> {new Date(app.createdAt).toLocaleString()}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-2 w-32">
                    {app.onboardingStatus === 'MORE_INFORMATION_REQUIRED' && (
                      <>
                        <button 
                          onClick={() => regenerateToken(app.id)}
                          disabled={regenerating === app.id}
                          className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-800 px-2 py-1.5 rounded transition-colors font-semibold shadow-sm disabled:opacity-50"
                        >
                          {regenerating === app.id ? "Sending..." : "Send Upload Link"}
                        </button>
                        <button 
                          onClick={() => setUploadModalAppId(app.id)}
                          className="text-xs border border-gray-300 hover:bg-gray-50 text-gray-700 px-2 py-1.5 rounded transition-colors"
                        >
                          Upload as Admin
                        </button>
                      </>
                    )}
                    <button 
                      onClick={() => resendEmail(app.id)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-1.5 rounded transition-colors"
                    >
                      Resend Status Email
                    </button>
                    {app.finixMerchantId && (
                      <a 
                        href={`https://dashboard.finix.com/merchants/${app.finixMerchantId}`}
                        target="_blank"
                        className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 px-2 py-1.5 rounded text-center transition-colors font-medium shadow-sm"
                      >
                        Finix Dashboard
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {apps.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No applications found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {uploadModalAppId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Upload Missing Documents</h2>
            <p className="text-sm text-gray-600 mb-6">
              Select a file (JPG, PNG, PDF up to 10MB) to upload securely to Finix on behalf of this merchant.
            </p>
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <input 
                  type="file" 
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setUploadModalAppId(null)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!uploadFile || uploading}
                  className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload & Trigger Verification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {irsLetterModalApp && (
        <IrsLetterReviewModal
          applicationId={irsLetterModalApp.id}
          organizationName={irsLetterModalApp.organizationName}
          onClose={() => setIrsLetterModalApp(null)}
        />
      )}
    </div>
  );
}
