import { AppProviders } from './AppProviders';
import { AppRouter } from '../router/AppRouter';

export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
