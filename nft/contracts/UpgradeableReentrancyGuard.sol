// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

abstract contract UpgradeableReentrancyGuard is Initializable {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _guardStatus;

    function __UpgradeableReentrancyGuard_init() internal onlyInitializing {
        _guardStatus = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_guardStatus != _ENTERED, "Reentrant call");
        _guardStatus = _ENTERED;
        _;
        _guardStatus = _NOT_ENTERED;
    }

    uint256[49] private __gap;
}
