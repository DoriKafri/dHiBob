"use client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mail, Phone, MapPin, Calendar, Building, Briefcase } from "lucide-react";

export default function EmployeeProfilePage({ params }: { params: { id: string } }) {
  const employee = { name: "Sarah Chen", role: "Senior Engineer", department: "Engineering", email: "sarah@acme.tech", phone: "+1 555-0123", location: "San Francisco, CA", startDate: "Mar 15, 2022", manager: "Tom Wilson", status: "Active" };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20"><AvatarFallback className="text-2xl bg-primary-100 text-primary-600">SC</AvatarFallback></Avatar>
            <div>
              <div className="flex items-center gap-3"><h1 className="text-2xl font-bold">{employee.name}</h1><Badge variant="success">{employee.status}</Badge></div>
              <p className="text-gray-500">{employee.role} · {employee.department}</p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center gap-1"><Mail size={14} />{employee.email}</span>
                <span className="flex items-center gap-1"><MapPin size={14} />{employee.location}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Tabs defaultValue="personal">
        <TabsList><TabsTrigger value="personal">Personal</TabsTrigger><TabsTrigger value="employment">Employment</TabsTrigger><TabsTrigger value="time-off">Time Off</TabsTrigger><TabsTrigger value="documents">Documents</TabsTrigger></TabsList>
        <TabsContent value="personal"><Card><CardHeader><CardTitle>Personal Information</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 gap-4"><div><p className="text-sm text-gray-500">Full Name</p><p className="font-medium">{employee.name}</p></div><div><p className="text-sm text-gray-500">Email</p><p className="font-medium">{employee.email}</p></div><div><p className="text-sm text-gray-500">Phone</p><p className="font-medium">{employee.phone}</p></div><div><p className="text-sm text-gray-500">Location</p><p className="font-medium">{employee.location}</p></div></div></CardContent></Card></TabsContent>
        <TabsContent value="employment"><Card><CardHeader><CardTitle>Employment Details</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 gap-4"><div><p className="text-sm text-gray-500">Department</p><p className="font-medium">{employee.department}</p></div><div><p className="text-sm text-gray-500">Start Date</p><p className="font-medium">{employee.startDate}</p></div><div><p className="text-sm text-gray-500">Manager</p><p className="font-medium">{employee.manager}</p></div><div><p className="text-sm text-gray-500">Role</p><p className="font-medium">{employee.role}</p></div></div></CardContent></Card></TabsContent>
      </Tabs>
    </div>
  );
}
