import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import UserSupportActions from "./UserSupportActions";

export default async function MerchantUserDetailsPage({
  params,
}: {
  params: Promise<{ churchId: string; userId: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { churchId, userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId, churchId },
  });

  if (!user) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-bold text-red-600">User not found</h2>
        <Link
          href={`/admin/merchants/${churchId}/users`}
          className="text-indigo-600 mt-4 inline-block"
        >
          &larr; Back to Users
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Link
          href={`/admin/merchants/${churchId}/users`}
          className="text-indigo-600 hover:text-indigo-900 font-medium"
        >
          &larr; Back
        </Link>
        <h2 className="text-xl font-bold">
          User Details: {user.name || "N/A"}
        </h2>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border space-y-4">
        <h3 className="text-lg font-bold border-b pb-2">Identity & Status</h3>
        <div className="grid grid-cols-2 gap-y-4 gap-x-8 max-w-3xl">
          <div>
            <div className="text-sm font-medium text-gray-500">Name</div>
            <div>{user.name || "N/A"}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">Email</div>
            <div>{user.email}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">Role</div>
            <div className="font-semibold">{user.role}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">Status</div>
            <div>
              {user.disabledAt ? (
                <span className="inline-flex rounded-full bg-red-100 px-2 text-xs font-semibold leading-5 text-red-800">
                  Disabled
                </span>
              ) : user.setPasswordTokenHash ? (
                <span className="inline-flex rounded-full bg-yellow-100 px-2 text-xs font-semibold leading-5 text-yellow-800">
                  Pending Invite
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800">
                  Active
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">Last Login</div>
            <div>
              {user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString()
                : "Never"}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">Created At</div>
            <div>{new Date(user.createdAt).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">
              Invited By User ID
            </div>
            <div>{user.invitedByUserId || "System"}</div>
          </div>
          <div>
            <div className="text-sm font-medium text-gray-500">
              Auth Version
            </div>
            <div>{user.authVersion}</div>
          </div>
          {user.disabledAt && (
            <div>
              <div className="text-sm font-medium text-gray-500">
                Disabled At
              </div>
              <div className="text-red-600">
                {new Date(user.disabledAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      <UserSupportActions user={user} churchId={churchId} />
    </div>
  );
}
