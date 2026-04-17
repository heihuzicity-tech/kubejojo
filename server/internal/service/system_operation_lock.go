package service

import "sync"

type SystemOperationBusyError struct {
	operationID string
}

func (e SystemOperationBusyError) Error() string {
	return "another system operation is already in progress"
}

func (e SystemOperationBusyError) OperationID() string {
	return e.operationID
}

type SystemOperationLock struct {
	operationID string
}

func (l *SystemOperationLock) OperationID() string {
	if l == nil {
		return ""
	}
	return l.operationID
}

// SystemOperationLockService provides the same orchestration boundary as sub2api:
// handlers own the lock lifecycle, while UpdateService only performs the action.
// kubejojo currently runs as a single process, so a process-local lock is sufficient.
type SystemOperationLockService struct {
	mu      sync.Mutex
	current *SystemOperationLock
}

func NewSystemOperationLockService() *SystemOperationLockService {
	return &SystemOperationLockService{}
}

func (s *SystemOperationLockService) Acquire(operationID string) (*SystemOperationLock, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current != nil {
		return nil, SystemOperationBusyError{operationID: s.current.operationID}
	}

	lock := &SystemOperationLock{operationID: operationID}
	s.current = lock
	return lock, nil
}

func (s *SystemOperationLockService) Release(lock *SystemOperationLock) {
	if s == nil || lock == nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.current == nil {
		return
	}
	if s.current.operationID != lock.operationID {
		return
	}
	s.current = nil
}
