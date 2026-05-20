import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Minimal canvas mock
function createMockCanvas() {
  const ctx = {
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    font: '',
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    fillText: vi.fn(),
  };
  return {
    getContext: vi.fn().mockReturnValue(ctx),
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,AAAA'),
    width: 400,
    height: 150,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 150, right: 400, bottom: 150 }),
    parentElement: { clientWidth: 400 },
    ctx,
  };
}

// Override HTMLCanvasElement.prototype.getContext in jsdom
let mockCanvas: ReturnType<typeof createMockCanvas>;
beforeEach(() => {
  mockCanvas = createMockCanvas();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mockCanvas.ctx as any);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
});

import { SignaturePad } from '@/components/documents/signature-pad';

describe('SignaturePad', () => {
  it('renders Draw and Type mode buttons', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    expect(screen.getByText('Draw')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
  });

  it('switching tabs calls onChange(null)', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    fireEvent.click(screen.getByText('Type'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('Clear button is disabled when no strokes', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    const clearBtn = screen.getByText('Clear').closest('button');
    expect(clearBtn).toBeDisabled();
  });

  it('R2: first stroke triggers onChange with signature data (no stale closure)', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    // Find the canvas element
    const canvas = document.querySelector('canvas')!;
    expect(canvas).toBeTruthy();

    // Simulate a single draw stroke: mousedown -> mousemove -> mouseup
    fireEvent.mouseDown(canvas, { clientX: 50, clientY: 50 });
    fireEvent.mouseMove(canvas, { clientX: 60, clientY: 60 });
    fireEvent.mouseUp(canvas);

    // After the first stroke, onChange should have been called with the data URL
    // This was the stale closure bug: hasStrokes was false during first mouseup
    expect(onChange).toHaveBeenCalledWith('data:image/png;base64,AAAA');
  });

  it('R5: Undo2 should not be imported (unused)', async () => {
    // Verify that the Undo2 icon is not rendered in the DOM
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    // The Undo button should not appear — only Clear button
    expect(screen.queryByText('Undo')).not.toBeInTheDocument();
  });

  it('Type mode renders font previews', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    fireEvent.click(screen.getByText('Type'));
    // Should show font names
    expect(screen.getByText('Dancing Script')).toBeInTheDocument();
    expect(screen.getByText('Great Vibes')).toBeInTheDocument();
    expect(screen.getByText('Pacifico')).toBeInTheDocument();
  });

  it('Type mode input renders and updates preview', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    fireEvent.click(screen.getByText('Type'));
    const input = screen.getByPlaceholderText('Type your full name...');
    fireEvent.change(input, { target: { value: 'John Doe' } });
    // The name should appear in the font preview buttons
    const previews = screen.getAllByText('John Doe');
    expect(previews.length).toBeGreaterThanOrEqual(1);
  });
});
