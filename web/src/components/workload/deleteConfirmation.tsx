import { Modal } from 'antd';

type DeleteConfirmationOptions = {
  resourceKind: string;
  name: string;
  namespace?: string;
  impact?: string;
  onConfirm: () => Promise<unknown>;
};

export function confirmResourceDelete({
  resourceKind,
  name,
  namespace,
  impact,
  onConfirm,
}: DeleteConfirmationOptions) {
  const target = namespace ? `${namespace}/${name}` : name;

  Modal.confirm({
    title: `Delete ${resourceKind} / ${target} ?`,
    content:
      impact ??
      `This submits a delete request for the current ${resourceKind}. The resource may disappear immediately depending on finalizers and controller behavior.`,
    okText: 'Delete',
    cancelText: 'Cancel',
    okButtonProps: { danger: true },
    onOk: onConfirm,
  });
}
