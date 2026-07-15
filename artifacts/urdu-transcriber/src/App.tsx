import { Toaster } from '@/components/ui/toaster';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import Home from '@/pages/Home';
import { ThemeProvider } from '@/components/theme-provider';

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="*" component={() => <div className="p-8 text-center text-muted-foreground">Page not found</div>} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider storageKey="theme">
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;
