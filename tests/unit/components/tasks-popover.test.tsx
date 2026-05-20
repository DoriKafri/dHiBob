import { render, screen, fireEvent } from '@testing-library/react';
import { TasksPopover } from '../../../src/components/layout/tasks-popover';
import { trpc } from '../../../src/lib/trpc';
import { vi, describe, it, expect } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../../../src/lib/trpc', () => ({
  trpc: {
    onboarding: {
      myTasks: {
        useQuery: vi.fn().mockReturnValue({ data: [{ id: '1', title: 'Task 1' }] }),
      }
    }
  }
}));

describe('TasksPopover', () => {
  it('renders a task from the trpc query', () => {
    render(<TasksPopover />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(screen.getByText('Task 1')).toBeDefined();
  });
});
