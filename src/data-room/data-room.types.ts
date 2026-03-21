import { IsIn, IsISO8601, IsOptional, IsString, MaxLength , Matches } from 'class-validator';

export type DataRoomPermissionLevel = 'view' | 'view_download';

export class CreateDataRoomAccessRequestInput {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { message: '$property must be a valid UUID' })
  startupOrgId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string | null;
}

export class ReviewDataRoomAccessRequestInput {
  @IsOptional()
  @IsIn(['view', 'view_download'])
  permissionLevel?: DataRoomPermissionLevel;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class RejectDataRoomAccessRequestInput {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class RevokeDataRoomAccessGrantInput {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

export class AcceptDataRoomTermsInput {
  // Placeholder for future: signature, version, etc.
}

export class RecordDocumentViewInput {
  @IsOptional()
  seconds?: number;
}

export type DataRoomAccessRequestStatus = 'pending' | 'approved' | 'rejected';

export type DataRoomAccessRequestView = {
  id: string;
  startup_org_id: string;
  requester_org_id: string;
  message: string | null;
  status: DataRoomAccessRequestStatus;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;

  startup_org_name?: string;
  requester_org_name?: string;
};

export type DataRoomAccessGrantView = {
  id: string;
  startup_org_id: string;
  grantee_org_id: string;
  permission_level: DataRoomPermissionLevel;
  terms_accepted_at: string | null;
  granted_at: string;
  revoked_at: string | null;
  expires_at: string | null;
};

export type DataRoomFolderView = {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
};

export type DataRoomDocumentView = {
  id: string;
  startup_org_id: string;
  folder_id: string | null;
  document_type: string;
  title: string;
  file_url: string | null;
  storage_bucket: string | null;
  storage_object_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  content_type: string | null;
  created_at: string;
  updated_at: string;
};

export type DataRoomContentsView = {
  startup_org_id: string;
  folders: DataRoomFolderView[];
  documents: DataRoomDocumentView[];
  grant: DataRoomAccessGrantView | null;
};

