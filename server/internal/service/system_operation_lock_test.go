package service

import "testing"

func TestSystemOperationLockServiceAcquireRelease(t *testing.T) {
	t.Parallel()

	lockService := NewSystemOperationLockService()

	first, err := lockService.Acquire("op-1")
	if err != nil {
		t.Fatalf("Acquire(op-1) returned error: %v", err)
	}
	if first == nil {
		t.Fatal("Acquire(op-1) returned nil lock")
	}
	if first.OperationID() != "op-1" {
		t.Fatalf("OperationID() = %q, want %q", first.OperationID(), "op-1")
	}

	_, err = lockService.Acquire("op-2")
	if err == nil {
		t.Fatal("expected busy error for second acquire")
	}

	busyErr, ok := err.(SystemOperationBusyError)
	if !ok {
		t.Fatalf("expected SystemOperationBusyError, got %T", err)
	}
	if busyErr.OperationID() != "op-1" {
		t.Fatalf("busy operation id = %q, want %q", busyErr.OperationID(), "op-1")
	}

	lockService.Release(first)

	second, err := lockService.Acquire("op-2")
	if err != nil {
		t.Fatalf("Acquire(op-2) after release returned error: %v", err)
	}
	if second.OperationID() != "op-2" {
		t.Fatalf("OperationID() = %q, want %q", second.OperationID(), "op-2")
	}
}
