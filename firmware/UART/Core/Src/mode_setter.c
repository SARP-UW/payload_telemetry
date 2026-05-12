#include "main.h"
#include "usb_device.h"
#include "mode_setter.h"


/* Jimmy Notes:
    Make one function setMode() that takes a EbyteMode enum type
    and uses switch case statements to set the modes
*/


// If EbyteMode is one of the user input strings then set the mode accordingly
void setMode(EbyteMode mode) {
    switch(mode) {
        case MODE_0:
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_RESET);
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_RESET);
            break;
        case MODE_1:
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_RESET);
            break;
        case MODE_2:
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_RESET);
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_SET);
            break;
        case MODE_3:
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);
            HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, GPIO_PIN_SET);            
            break;
        default:
            break;
    }
}