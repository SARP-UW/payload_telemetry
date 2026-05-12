#include "main.h"
#include "usb_device.h"
#include "instructions.h"


const uint8_t CURRENT_PARAMS_CMD[3] = {0xC1, 0xC1, 0xC1};
const uint8_t version[3] = {0xC3, 0xC3, 0xC3};
const uint8_t reset[3] = {0xC4, 0xC4, 0xC4};

extern UART_HandleTypeDef huart2;


void current_parameters(void){
    // setMode(3);
    HAL_UART_Transmit(&huart2, CURRENT_PARAMS_CMD, 3, HAL_MAX_DELAY);
}

void present_version(void){
    // setMode(3);
    HAL_UART_Transmit(&huart2, version, 3, HAL_MAX_DELAY);
}

void reset_parameters(void){
    // setMode(3);
    HAL_UART_Transmit(&huart2, reset, 3, HAL_MAX_DELAY);
}

void set_parameters(void){
    // setMode(3);
    
}