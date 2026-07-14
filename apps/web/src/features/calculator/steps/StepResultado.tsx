import { useCalculator } from '@/features/calculator/CalculatorProvider';
import { ResultPanel } from '@/features/calculator/ResultPanel';
import { Card, CardContent } from '@/components/ui';

export function StepResultado() {
  const { result, calcError, selectedRate, setSelectedRate } = useCalculator();
  if (calcError) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-destructive">{calcError}</CardContent>
      </Card>
    );
  }
  if (!result) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          Completa los pasos anteriores para ver el cálculo.
        </CardContent>
      </Card>
    );
  }
  return <ResultPanel result={result} selectedRate={selectedRate} onSelectRate={setSelectedRate} />;
}
