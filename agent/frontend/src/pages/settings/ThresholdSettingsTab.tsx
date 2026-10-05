// 프로젝트 및 인스턴스별 임계값 관리 화면
import { usePermissions } from '../../components/PermissionContext';
import { Button, FormSelect, FormSelectOption, TextInput } from '../../components/ui';
import { Table, Tbody, Td, Th, Thead, Tr } from '../../components/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { getThresholds, saveThresholds } from '../../api';
import { Loading, Failure } from '../../components/QueryState';
import { Threshold } from '../../generated/models/Threshold';
import { DecimalInput, LabeledField, MutationError, ValidationAlert } from './forms';
import {
  THRESHOLD_METRICS,
  changeThreshold,
  changeThresholdMetric,
  changeThresholdScope,
  changeThresholdText,
  validateThresholds,
} from './validation';

export default function ThresholdSettingsTab() {
  const { isAdmin } = usePermissions();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['thresholds'], queryFn: getThresholds });
  const [draft, setDraft] = useState<Threshold[]>();
  const [validation, setValidation] = useState<string>();
  const save = useMutation({
    mutationFn: saveThresholds,
    onSuccess: (saved) => {
      setDraft(saved);
      client.setQueryData(['thresholds'], saved);
    },
  });
  if (query.isPending) {
    return <Loading />;
  }
  if (query.isError) {
    return <Failure />;
  }
  const baseValues = isAdmin
    ? (query.data ?? [])
    : (query.data ?? []).filter((value) => value.scope !== 'GLOBAL');
  const values = draft ?? baseValues;

  function saveCurrent() {
    const error = validateThresholds(values);
    setValidation(error);
    if (!error) {
      save.mutate(values);
    }
  }

  function addOverride() {
    setDraft([
      ...values,
      {
        scope: Threshold.scope.PROJECT,
        projectId: '',
        instanceId: null,
        metricKey: Threshold.metricKey.SYSTEM_CPU,
        warningValue: 0.8,
        criticalValue: 0.9,
      },
    ]);
  }

  return (
    <>
      <Table variant="compact" aria-label="임계치">
        <Thead>
          <Tr>
            <Th>범위</Th>
            <Th>프로젝트</Th>
            <Th>인스턴스</Th>
            <Th>Metric</Th>
            <Th>경고</Th>
            <Th>위험</Th>
          </Tr>
        </Thead>
        <Tbody>
          {values.map((threshold, index) => {
            const added = index >= baseValues.length;
            const label = added ? '새 임계치' : threshold.metricKey;
            const id = `threshold-${index}`;
            return (
              <Tr key={`${index}/${threshold.scope}/${threshold.metricKey}`}>
                <Td>
                  <LabeledField id={`${id}-scope`} label="범위">
                    <FormSelect
                      id={`${id}-scope`}
                      aria-label={`${label} 범위`}
                      value={threshold.scope}
                      onChange={(_, next) =>
                        setDraft(changeThresholdScope(values, index, next as Threshold.scope))
                      }
                    >
                      {(isAdmin ? ['GLOBAL', 'PROJECT', 'INSTANCE'] : ['PROJECT', 'INSTANCE']).map(
                        (scope) => (
                          <FormSelectOption key={scope} value={scope} label={scope} />
                        ),
                      )}
                    </FormSelect>
                  </LabeledField>
                </Td>
                <Td>
                  <LabeledField id={`${id}-project`} label="프로젝트 ID">
                    <TextInput
                      id={`${id}-project`}
                      aria-label={`${label} 프로젝트 ID`}
                      value={threshold.projectId ?? ''}
                      isDisabled={threshold.scope === 'GLOBAL'}
                      onChange={(_, next) =>
                        setDraft(changeThresholdText(values, index, 'projectId', next))
                      }
                    />
                  </LabeledField>
                </Td>
                <Td>
                  <LabeledField id={`${id}-instance`} label="인스턴스 ID">
                    <TextInput
                      id={`${id}-instance`}
                      aria-label={`${label} 인스턴스 ID`}
                      value={threshold.instanceId ?? ''}
                      isDisabled={threshold.scope !== 'INSTANCE'}
                      onChange={(_, next) =>
                        setDraft(changeThresholdText(values, index, 'instanceId', next))
                      }
                    />
                  </LabeledField>
                </Td>
                <Td>
                  <LabeledField id={`${id}-metric`} label="Metric">
                    <FormSelect
                      id={`${id}-metric`}
                      aria-label={`${label} metric`}
                      value={threshold.metricKey}
                      onChange={(_, next) =>
                        setDraft(changeThresholdMetric(values, index, next as Threshold.metricKey))
                      }
                    >
                      {THRESHOLD_METRICS.map((metric) => (
                        <FormSelectOption key={metric} value={metric} label={metric} />
                      ))}
                    </FormSelect>
                  </LabeledField>
                </Td>
                <Td>
                  <DecimalInput
                    id={`${id}-warning`}
                    label="경고"
                    ariaLabel={`${label} 경고`}
                    value={threshold.warningValue}
                    onChange={(next) =>
                      setDraft(changeThreshold(values, index, 'warningValue', String(next)))
                    }
                  />
                </Td>
                <Td>
                  <DecimalInput
                    id={`${id}-critical`}
                    label="위험"
                    ariaLabel={`${label} 위험`}
                    value={threshold.criticalValue}
                    onChange={(next) =>
                      setDraft(changeThreshold(values, index, 'criticalValue', String(next)))
                    }
                  />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
      <div className="settings-toolbar">
        <Button variant="secondary" onClick={addOverride}>
          임계치 추가
        </Button>
        <Button
          aria-label="임계치 저장"
          isDisabled={!draft}
          isLoading={save.isPending}
          onClick={saveCurrent}
        >
          저장
        </Button>
      </div>
      <ValidationAlert message={validation} />
      <MutationError failed={save.isError} />
    </>
  );
}
