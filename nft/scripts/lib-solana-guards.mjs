export function buildSolanaGuardConfig(deployment, umiFns) {
  const { dateTime, lamports, none, publicKey, some } = umiFns;
  const startDate = deployment.startDate || null;
  const startDateGuard = startDate ? some({ date: dateTime(startDate) }) : none();
  const groups = [];

  if (deployment.paymentGroups?.sol) {
    groups.push({
      label: 'sol',
      guards: {
        solPayment: some({
          lamports: lamports(BigInt(deployment.paymentGroups.sol.lamports)),
          destination: publicKey(deployment.paymentGroups.sol.destination),
        }),
        startDate: startDateGuard,
      },
    });
  }

  if (deployment.paymentGroups?.usdc) {
    groups.push({
      label: 'usdc',
      guards: {
        tokenPayment: some({
          amount: BigInt(deployment.paymentGroups.usdc.amount),
          mint: publicKey(deployment.paymentGroups.usdc.mint),
          destinationAta: publicKey(deployment.paymentGroups.usdc.destinationAta),
        }),
        startDate: startDateGuard,
      },
    });
  }

  if (groups.length > 0) {
    return {
      guards: {
        startDate: startDateGuard,
      },
      groups,
    };
  }

  return {
    guards: {
      solPayment: some({
        lamports: lamports(BigInt(deployment.priceLamports || '0')),
        destination: publicKey(deployment.treasury),
      }),
      startDate: startDateGuard,
    },
    groups: [],
  };
}
