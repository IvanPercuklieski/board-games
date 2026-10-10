import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { InputDirective, TextFieldComponent } from './text-field.component';

const imports = [TextFieldComponent, InputDirective];

describe('TextFieldComponent', () => {
  it('labels its input', async () => {
    await render(`<bt-text-field label="Your name"><input btInput /></bt-text-field>`, {
      imports,
    });
    const input = screen.getByLabelText('Your name');
    await userEvent.type(input, 'Bob');
    expect((input as HTMLInputElement).value).toBe('Bob');
  });

  it('describes the input with its hint', async () => {
    await render(
      `<bt-text-field label="Your name" hint="Shown to the other players"><input btInput /></bt-text-field>`,
      { imports },
    );
    expect(screen.getByRole('textbox', { description: 'Shown to the other players' })).toBeTruthy();
  });

  it('marks the input invalid and announces the error', async () => {
    await render(
      `<bt-text-field label="Email" error="Enter a valid email"><input btInput type="email" /></bt-text-field>`,
      { imports },
    );
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('textbox', { description: 'Enter a valid email' })).toBe(input);
  });

  it('gives each field its own id', async () => {
    await render(
      `<bt-text-field label="A"><input btInput /></bt-text-field>
       <bt-text-field label="B"><input btInput /></bt-text-field>`,
      { imports },
    );
    expect(screen.getByLabelText('A').id).not.toBe(screen.getByLabelText('B').id);
  });
});
