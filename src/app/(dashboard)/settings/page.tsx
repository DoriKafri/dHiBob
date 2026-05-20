"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Building, Shield, Bell, Lock, Check, X } from "lucide-react";
import { NotificationPreferences } from "@/components/settings/notification-preferences";
import { trpc } from "@/lib/trpc";

const ROLES = [
  {
    name: 'Super Admin',
    value: 'SUPER_ADMIN',
    description: 'Full system access with no restrictions',
    permissions: {
      'Manage employees': true,
      'View all salaries': true,
      'View reports & analytics': true,
      'Manage IT assets & licenses': true,
      'Manage onboarding/offboarding': true,
      'Change user roles': true,
      'Access settings': true,
    },
  },
  {
    name: 'Admin',
    value: 'ADMIN',
    description: 'Full administrative access',
    permissions: {
      'Manage employees': true,
      'View all salaries': true,
      'View reports & analytics': true,
      'Manage IT assets & licenses': true,
      'Manage onboarding/offboarding': true,
      'Change user roles': true,
      'Access settings': true,
    },
  },
  {
    name: 'HR',
    value: 'HR',
    description: 'Human resources management access',
    permissions: {
      'Manage employees': true,
      'View all salaries': true,
      'View reports & analytics': true,
      'Manage IT assets & licenses': false,
      'Manage onboarding/offboarding': true,
      'Change user roles': false,
      'Access settings': true,
    },
  },
  {
    name: 'Operator',
    value: 'OPERATOR',
    description: 'Admin access without salary visibility',
    permissions: {
      'Manage employees': true,
      'View all salaries': false,
      'View reports & analytics': false,
      'Manage IT assets & licenses': true,
      'Manage onboarding/offboarding': true,
      'Change user roles': true,
      'Access settings': true,
    },
  },
  {
    name: 'IT',
    value: 'IT',
    description: 'IT asset and license management',
    permissions: {
      'Manage employees': false,
      'View all salaries': false,
      'View reports & analytics': false,
      'Manage IT assets & licenses': true,
      'Manage onboarding/offboarding': false,
      'Change user roles': false,
      'Access settings': false,
    },
  },
  {
    name: 'Employee',
    value: 'EMPLOYEE',
    description: 'Default role — view and edit own profile only',
    permissions: {
      'Manage employees': false,
      'View all salaries': false,
      'View reports & analytics': false,
      'Manage IT assets & licenses': false,
      'Manage onboarding/offboarding': false,
      'Change user roles': false,
      'Access settings': false,
    },
  },
];

export default function SettingsPage() {
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company"><Building size={16} className="mr-1" />Company</TabsTrigger>
          <TabsTrigger value="roles"><Shield size={16} className="mr-1" />Roles</TabsTrigger>
          <TabsTrigger value="notifications"><Bell size={16} className="mr-1" />Notifications</TabsTrigger>
          <TabsTrigger value="security"><Lock size={16} className="mr-1" />Security</TabsTrigger>
        </TabsList>
        <TabsContent value="company"><Card><CardHeader><CardTitle>Company Information</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><label className="text-sm font-medium">Company Name</label><Input defaultValue="Acme Technologies" /></div><div><label className="text-sm font-medium">Industry</label><Input defaultValue="Technology" /></div><div><label className="text-sm font-medium">Website</label><Input defaultValue="https://acme.tech" /></div><div><label className="text-sm font-medium">Timezone</label><Input defaultValue="America/New_York" /></div></div><Button>Save Changes</Button></CardContent></Card></TabsContent>
        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <CardTitle>Role Management</CardTitle>
              <CardDescription>System roles and their permissions. Assign roles to employees from their profile page.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ROLES.map(role => (
                  <div key={role.value} className="border dark:border-charcoal-700 rounded-lg overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-charcoal-800 transition-colors"
                      onClick={() => setExpandedRole(expandedRole === role.value ? null : role.value)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                          <Shield size={16} className="text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                          <p className="font-medium">{role.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{role.description}</p>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 font-mono">{role.value}</span>
                    </div>
                    {expandedRole === role.value && (
                      <div className="border-t dark:border-charcoal-700 px-4 py-3 bg-gray-50 dark:bg-charcoal-800/50">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Permissions</p>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(role.permissions).map(([perm, allowed]) => (
                            <div key={perm} className="flex items-center gap-2 text-sm">
                              {allowed ? (
                                <Check size={14} className="text-emerald-500 shrink-0" />
                              ) : (
                                <X size={14} className="text-gray-300 dark:text-charcoal-600 shrink-0" />
                              )}
                              <span className={allowed ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}>{perm}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Configure how you receive notifications across different channels.</CardDescription>
            </CardHeader>
            <CardContent>
              <NotificationPreferences />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password. You&apos;ll need to enter your current password for verification.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const changePassword = trpc.user.changePassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setError('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err) => {
      setError(err.message);
      setSuccess(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (!/[A-Z]/.test(newPassword)) { setError('Password must contain at least one uppercase letter'); return; }
    if (!/[0-9]/.test(newPassword)) { setError('Password must contain at least one number'); return; }
    if (!/[^A-Za-z0-9]/.test(newPassword)) { setError('Password must contain at least one special character'); return; }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from current password');
      return;
    }

    changePassword.mutate({ currentPassword, newPassword });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium mb-1">Current Password</label>
        <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">New Password</label>
        <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Min 8 chars, uppercase, number, special" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Confirm New Password</label>
        <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {success && <p className="text-sm text-emerald-600">Password changed successfully.</p>}
      <Button type="submit" disabled={changePassword.isPending}>
        {changePassword.isPending ? 'Changing...' : 'Change Password'}
      </Button>
    </form>
  );
}
