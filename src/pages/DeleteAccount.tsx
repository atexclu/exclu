import { DeleteAccountFlow } from '@/components/settings/DeleteAccountFlow';

interface DeleteAccountProps {
  backUrl?: string;
}

export default function DeleteAccount({ backUrl = '/app/profile' }: DeleteAccountProps) {
  return <DeleteAccountFlow backUrl={backUrl} />;
}
