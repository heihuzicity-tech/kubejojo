import { Alert, Button, Modal, Select, Space, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

import { buildPodExecWebSocketUrl, type PodItem } from '../../services/cluster';

type ExecStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

type PodExecTerminalModalProps = {
  open: boolean;
  target?: PodItem;
  token: string;
  onClose: () => void;
};

type ExecSocketMessage =
  | {
      type: 'input';
      data: string;
    }
  | {
      type: 'resize';
      cols: number;
      rows: number;
    };

function execStatusColor(status: ExecStatus) {
  switch (status) {
    case 'connected':
      return 'green';
    case 'connecting':
      return 'blue';
    case 'error':
      return 'red';
    case 'closed':
      return 'default';
    default:
      return 'default';
  }
}

function sendSocketMessage(socket: WebSocket, message: ExecSocketMessage) {
  socket.send(JSON.stringify(message));
}

export function PodExecTerminalModal({
  open,
  target,
  token,
  onClose,
}: PodExecTerminalModalProps) {
  const [execContainer, setExecContainer] = useState<string>();
  const [execCommand, setExecCommand] = useState('/bin/sh');
  const [execStatus, setExecStatus] = useState<ExecStatus>('idle');
  const [execSessionKey, setExecSessionKey] = useState(0);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!open || !target) {
      setExecStatus('idle');
      return;
    }

    setExecContainer(target.containers[0]?.name);
    setExecCommand('/bin/sh');
    setExecSessionKey((value) => value + 1);
  }, [open, target]);

  useEffect(() => {
    if (!open || !target || !token || !execContainer || !terminalHostRef.current) {
      return;
    }

    const host = terminalHostRef.current;
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 3000,
      theme: {
        background: '#020617',
        foreground: '#e2e8f0',
        cursor: '#f8fafc',
        cursorAccent: '#020617',
        selectionBackground: '#334155',
      },
    });
    const fitAddon = new FitAddon();
    const socket = new WebSocket(
      buildPodExecWebSocketUrl(token, target.namespace, target.name, execContainer, execCommand),
    );

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    socketRef.current = socket;
    setExecStatus('connecting');

    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminal.writeln(`Connecting to ${target.namespace}/${target.name} (${execContainer}) ...`);

    const fitTerminal = () => {
      fitAddon.fit();

      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      sendSocketMessage(socket, {
        type: 'resize',
        cols: terminal.cols,
        rows: terminal.rows,
      });
    };

    const openTimer = window.setTimeout(() => {
      fitTerminal();
      terminal.focus();
    }, 40);

    const dataDisposable = terminal.onData((data) => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      sendSocketMessage(socket, {
        type: 'input',
        data,
      });
    });

    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      setExecStatus('connected');
      fitTerminal();
      terminal.focus();
    };

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        terminal.write(event.data);
        return;
      }

      terminal.write(new Uint8Array(event.data));
    };

    socket.onerror = () => {
      setExecStatus('error');
    };

    socket.onclose = () => {
      setExecStatus((current) => (current === 'error' ? 'error' : 'closed'));
    };

    const resizeObserver = new ResizeObserver(() => {
      fitTerminal();
    });
    resizeObserver.observe(host);
    resizeObserverRef.current = resizeObserver;

    return () => {
      window.clearTimeout(openTimer);
      resizeObserver.disconnect();
      resizeObserverRef.current = null;
      dataDisposable.dispose();
      socket.close();
      socketRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [execCommand, execContainer, execSessionKey, open, target, token]);

  const containerOptions =
    target?.containers.map((item) => ({
      label: item.name,
      value: item.name,
    })) ?? [];

  return (
    <Modal
      title={target ? `Pod Exec / ${target.namespace}/${target.name}` : 'Pod Exec'}
      open={open}
      onCancel={onClose}
      footer={null}
      width={980}
      destroyOnHidden
    >
      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Space wrap>
            <Typography.Text type="secondary">Container</Typography.Text>
            <Select
              value={execContainer}
              options={containerOptions}
              onChange={(value) => {
                setExecContainer(value);
                setExecSessionKey((current) => current + 1);
              }}
              style={{ minWidth: 220 }}
            />
            <Typography.Text type="secondary">Shell</Typography.Text>
            <Select
              value={execCommand}
              options={[
                { label: '/bin/sh', value: '/bin/sh' },
                { label: '/bin/bash', value: '/bin/bash' },
              ]}
              onChange={(value) => {
                setExecCommand(value);
                setExecSessionKey((current) => current + 1);
              }}
              style={{ minWidth: 180 }}
            />
            <Tag color={execStatusColor(execStatus)}>{execStatus}</Tag>
          </Space>

          <Space wrap>
            <Button
              onClick={() => {
                terminalRef.current?.clear();
              }}
            >
              Clear
            </Button>
            <Button onClick={() => setExecSessionKey((value) => value + 1)}>Reconnect</Button>
          </Space>
        </div>

        <Alert
          type="info"
          showIcon
          message="Interactive terminal with TTY resize support. Use it for in-container diagnostics."
        />

        <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-slate-950 shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <Typography.Text className="!mb-0 !ml-2 !text-xs !text-slate-300">
              {target ? `${target.name} / ${execContainer}` : 'Terminal'}
            </Typography.Text>
          </div>
          <div ref={terminalHostRef} className="h-[460px] w-full px-3 py-3" />
        </div>
      </section>
    </Modal>
  );
}
