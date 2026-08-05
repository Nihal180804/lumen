import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the music player with the first track', () => {
  render(<App />);
  const nowPlaying = screen.getByText(/Now Playing: Track 1/i);
  expect(nowPlaying).toBeInTheDocument();
});
