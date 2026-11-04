// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TemplateDialog from './TemplateDialog';

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('../../../services/api/apiClient', () => ({ apiJson }));

afterEach(() => vi.clearAllMocks());

describe('TemplateDialog', () => {
  it('creates a template with the entered metadata', async () => {
    apiJson.mockResolvedValue({ templateName: 'North America' });
    const onComplete = vi.fn();
    render(
      <TemplateDialog
        mode="create"
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    );

    fireEvent.change(screen.getByLabelText(/template name/i), {
      target: { value: 'North America' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));

    await waitFor(() =>
      expect(apiJson).toHaveBeenCalledWith(
        '/templates',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(JSON.parse(apiJson.mock.calls[0][1].body)).toMatchObject({
      templateName: 'North America',
      section: 'Forecast',
      version: '10+2',
      currentForecast: 0,
    });
    expect(onComplete).toHaveBeenCalled();
  });

  it('parses a CSV and submits its template rows', async () => {
    apiJson.mockResolvedValue({ created: [{ templateName: 'Uploaded' }] });
    const onComplete = vi.fn();
    const { container } = render(
      <TemplateDialog
        mode="upload"
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    );
    const file = new File(
      [
        'Template Name,Version,Status,Current Forecast\nUploaded,10+2,Working,1250',
      ],
      'templates.csv',
      { type: 'text/csv' },
    );
    file.text = () =>
      Promise.resolve(
        'Template Name,Version,Status,Current Forecast\nUploaded,10+2,Working,1250',
      );

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });
    expect(
      await screen.findByText('1 template row(s) ready to import.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upload templates' }));

    await waitFor(() =>
      expect(apiJson).toHaveBeenCalledWith(
        '/templates/upload',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(JSON.parse(apiJson.mock.calls[0][1].body).rows[0]).toMatchObject({
      templateName: 'Uploaded',
      version: '10+2',
      currentForecast: 1250,
    });
    expect(onComplete).toHaveBeenCalled();
  });
});
