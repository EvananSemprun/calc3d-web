import { CalculatorProvider } from '@/features/calculator/CalculatorProvider';
import { CalculatorScreen } from '@/features/calculator/CalculatorScreen';

export function CalculatorPage() {
  return (
    <CalculatorProvider>
      <CalculatorScreen />
    </CalculatorProvider>
  );
}
