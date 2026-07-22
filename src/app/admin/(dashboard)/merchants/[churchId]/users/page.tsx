import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function MerchantUsersPage({
  params,
}: {
  params: Promise<{ churchId: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { churchId } = await params;

  const users = await prisma.user.findMany({
    where: { churchId },
    orderBy: { createdAt: "desc" },
  });

  const total = users.length;
  const owners = users.filter((u) => u.role === "owner").length;
  const admins = users.filter((u) => u.role === "admin").length;
  const fundraisers = users.filter((u) => u.role === "fundraiser").length;
  const viewers = users.filter((u) => u.role === "viewer").length;
  const active = users.filter(
    (u) => !u.disabledAt && !u.setPasswordTokenHash,
  ).length;
  const disabled = users.filter((u) => !!u.disabledAt).length;
  const pending = users.filter((u) => !!u.setPasswordTokenHash).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Users</h2>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-500">Total Users</div>
          <div className="text-2xl font-semibold">{total}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-500">Active / Disabled</div>
          <div className="text-2xl font-semibold">
            {active} / {disabled}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-500">Pending Invites</div>
          <div className="text-2xl font-semibold">{pending}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="text-sm text-gray-500">Roles</div>
          <div className="text-sm">
            Owners: {owners}, Admins: {admins}
            <br />
            Fundraisers: {fundraisers}, Viewers: {viewers}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Login
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invited By
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {user.name || "N/A"}
                  </div>
                  <div className="text-sm text-gray-500">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.role}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
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
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString()
                    : "Never"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.invitedByUserId || "System"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <Link
                    href={`/admin/merchants/${churchId}/users/${user.id}`}
                    className="text-indigo-600 hover:text-indigo-900"
                  >
                    View &rarr;
                  </Link>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-4 text-center text-sm text-gray-500"
                >
                  No users found for this merchant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
