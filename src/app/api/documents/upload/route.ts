import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { prisma } from '@/lib/db';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'general';
    const employeeId = formData.get('employeeId') as string | undefined;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validation: File Size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 });
    }

    // Validation: MIME Type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: PDF, Images (JPEG, PNG, WEBP), DOCX' }, { status: 400 });
    }

    // Authorization: Verify employeeId if provided
    if (employeeId) {
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { companyId: true },
      });

      if (!employee || employee.companyId !== session.user.companyId) {
        return NextResponse.json({ error: 'Unauthorized for this employee' }, { status: 403 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let filePath: string;

    try {
      filePath = await storage.uploadFile(buffer, file.name, folder);
    } catch (error) {
      console.error('[upload] Storage error:', error);
      return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 });
    }

    try {
      const doc = await prisma.document.create({
        data: {
          companyId: session.user.companyId,
          employeeId: employeeId || null,
          name: file.name,
          type: folder.toUpperCase(),
          folder,
          filePath,
          fileSize: file.size,
          mimeType: file.type,
          uploadedBy: session.user.id,
          signatureStatus: formData.get('requireSignature') === 'true' ? 'PENDING' : 'VIEW_ONLY',
        },
      });

      return NextResponse.json(doc);
    } catch (error) {
      console.error('[upload] Database error:', error);
      // Atomicity: Attempt to delete the uploaded file if database record creation fails
      try {
        await storage.deleteFile(filePath);
      } catch (deleteError) {
        console.error('[upload] Failed to cleanup dangling file:', deleteError);
      }
      return NextResponse.json({ error: 'Failed to save document metadata' }, { status: 500 });
    }
  } catch (error) {
    console.error('[upload] Unexpected error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
