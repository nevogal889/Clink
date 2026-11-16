import { render, screen } from '@testing-library/react-native';

import Home from './index';

describe('placeholder home route', () => {
  it('renders', async () => {
    await render(<Home />);
    expect(screen.getByTestId('placeholder-home')).toBeTruthy();
  });

  it('resolves the shared workspace package', () => {
    expect(jest.requireActual('@clink/shared')).toBeDefined();
  });
});
