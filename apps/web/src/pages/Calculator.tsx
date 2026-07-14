import { CalculatorProvider } from '@/features/calculator/CalculatorProvider';
import { Wizard } from '@/features/calculator/Wizard';

export function CalculatorPage() {
  return (
    <CalculatorProvider>
      <Wizard />
    </CalculatorProvider>
  );
}
