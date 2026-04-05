import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recipientsApi } from '@/api/recipients.api';
import { CreateRecipientPayload } from '@/types/recipient';

export const useCreateRecipient = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateRecipientPayload) => recipientsApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipients'] });
    },
  });
};
