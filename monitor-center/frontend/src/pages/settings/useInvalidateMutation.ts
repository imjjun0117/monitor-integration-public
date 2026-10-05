// 설정 변경 후 관련 조회 결과 갱신
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

export function useInvalidateMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
  queryKey: QueryKey,
  afterSuccess?: () => void,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      afterSuccess?.();
      await client.invalidateQueries({ queryKey });
    },
  });
}
