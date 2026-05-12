/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "usb_device.h"
#include "usbd_cdc_if.h"
#include "instructions.h"
#include "mode_setter.h"
#include "Telemetry_Packet.h"
#include <random>

extern "C" {

// #include "packet.h"
/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* USER CODE END PTD */

/* Private define ------------------------------------------------------------*/
/* USER CODE BEGIN PD */

/* USER CODE END PD */

/* Private macro -------------------------------------------------------------*/
/* USER CODE BEGIN PM */

/* USER CODE END PM */

/* Private variables ---------------------------------------------------------*/
UART_HandleTypeDef huart2;

/* USER CODE BEGIN PV */

/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_USART2_UART_Init(void);
/* USER CODE BEGIN PFP */

/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */

// Buffer to receive raw UART data (e.g., "123,4,5")

volatile uint8_t rxBuffer[sizeof(Telemetry_Packet)] = {'\0'};
uint8_t helloWorld[13] = "Hello World\n";
uint8_t callSign[8] = "KMD776\n";
volatile uint8_t dataReady = 0;
char userInput[32] = {'\0'};
uint8_t sensorA = 0;
uint8_t sensorB = 0;
uint8_t sensorC = 0;

// Structured data to store parsed numbers
// SensorData_t sensorData = {
    // .photoresistor = 0,
    // .button = 0,
    // .led = 0
// };



/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{

  /* USER CODE BEGIN 1 */

  /* USER CODE END 1 */

  /* MCU Configuration--------------------------------------------------------*/

  /* Reset of all peripherals, Initializes the Flash interface and the Systick. */
  HAL_Init();

  /* USER CODE BEGIN Init */

  /* USER CODE END Init */

  /* Configure the system clock */
  SystemClock_Config();

  /* USER CODE BEGIN SysInit */

  /* USER CODE END SysInit */

  /* Initialize all configured peripherals */
  MX_GPIO_Init();
  MX_USART2_UART_Init();
  MX_USB_DEVICE_Init();
  /* USER CODE BEGIN 2 */
  // Initializes the UART receive interupt, so that we can interupt the main loop to recieve data
  HAL_UART_Receive_IT(&huart2, (uint8_t*)rxBuffer, sizeof(rxBuffer));
  /* USER CODE END 2 */
   // Turns on onboard LED when program is running
  HAL_GPIO_WritePin(GPIOC, 13, GPIO_PIN_SET);
  /* Infinite loop */
  while (1){
    // lets us create random stuff and things
    std::mt19937 gen;
    std::uniform_int_distribution<> dist(0, 100);

    // Creates random packet
    Telemetry_Packet packet;
    packet.packet_id = 0x1234;
    packet.temp = dist(gen);
    packet.latitude = dist(gen);
    packet.longitude = dist(gen);
    packet.altitude = dist(gen);
    packet.utc_time = dist(gen);
    packet.velocity = dist(gen);

    union {
      Telemetry_Packet packet;
      uint8_t bytes[sizeof(packet)];
    } packet_bytes = { packet };

    // get user input
    // CDC_Receive_FS(userInput, sizeof(userInput) - 1);
    // userInput[sizeof(userInput) - 1] = '\0';

    //Recieving
    if(dataReady) {
      CDC_Transmit_FS((uint8_t*)rxBuffer, sizeof(Telemetry_Packet));
      memset((uint8_t*)rxBuffer, 0, sizeof(rxBuffer));
      dataReady = 0;
    }


    // CDC_Transmit_FS((uint8_t*)"hi\r\n", 4);    
    // re-enables the UART Recueve interupt
    HAL_UART_Receive_IT(&huart2, (uint8_t*)rxBuffer, sizeof(rxBuffer));
    // CDC_Transmit_FS((uint8_t*)"ho\r\n", 4);    

    // Transmitting data over UART
    // TEMPORARY TRANSMIT FOR TESTING!!!!!!
    // HAL_UART_Transmit(&huart2, helloWorld, sizeof(helloWorld), HAL_MAX_DELAY);
    // HAL_UART_Transmit(&huart2, callSign, sizeof(callSign), HAL_MAX_DELAY);

    // Trasnmitting random packet
    // HAL_UART_Transmit(&huart2, (const uint8_t *) packet_bytes.bytes, sizeof(packet_bytes.bytes), HAL_MAX_DELAY);


    // Goes through user input and determines the correct action or function to call
    if(userInput[0] == '0' || userInput[0] == '1' || userInput[0] == '2' || userInput[0] == '3') {
      setMode((EbyteMode)*userInput);
      // Clear user input after processing
      userInput[0] = '\0'; 
    } else if (strcmp(userInput,"Current Parameters") == 0) {
      current_parameters();
      // Clear user input after processing
      userInput[0] = '\0';
    } else if(strcmp(userInput,"Version Numbers") == 0) {
      present_version();
      // Clear user input after processing
      userInput[0] = '\0';
    } else if(strcmp(userInput,"Reset Parameters") == 0) {
      reset_parameters();
      // Clear user input after processing
      userInput[0] = '\0';
    } else if(userInput[0] != '\0'){ 
      HAL_UART_Transmit(&huart2, (uint8_t*)userInput, sizeof(userInput) - 1, HAL_MAX_DELAY);
      // Clear input after processing
      userInput[0] = '\0';
    }

    HAL_Delay(1000);
  }
  /* USER CODE BEGIN WHILE */

    /* USER CODE END WHILE */

    /* USER CODE BEGIN 3 */
  
  /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration
  * @retval None
  */
void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  /** Configure the main internal regulator output voltage
  */
  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE2);

  /** Initializes the RCC Oscillators according to the specified parameters
  * in the RCC_OscInitTypeDef structure.
  */
  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI|RCC_OSCILLATORTYPE_HSE;
  RCC_OscInitStruct.HSEState = RCC_HSE_ON;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;
  RCC_OscInitStruct.PLL.PLLM = 15;
  RCC_OscInitStruct.PLL.PLLN = 144;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = 5;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  /** Initializes the CPU, AHB and APB buses clocks
  */
  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0) != HAL_OK)
  {
    Error_Handler();
  }
}

/**
  * @brief USART2 Initialization Function
  * @param None
  * @retval None
  */
static void MX_USART2_UART_Init(void)
{

  /* USER CODE BEGIN USART2_Init 0 */

  /* USER CODE END USART2_Init 0 */

  /* USER CODE BEGIN USART2_Init 1 */

  /* USER CODE END USART2_Init 1 */
  huart2.Instance = USART2;
  huart2.Init.BaudRate = 9600;
  huart2.Init.WordLength = UART_WORDLENGTH_8B;
  huart2.Init.StopBits = UART_STOPBITS_1;
  huart2.Init.Parity = UART_PARITY_NONE;
  huart2.Init.Mode = UART_MODE_TX_RX;
  huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
  huart2.Init.OverSampling = UART_OVERSAMPLING_16;
  if (HAL_UART_Init(&huart2) != HAL_OK)
  {
    Error_Handler();
  }
  /* USER CODE BEGIN USART2_Init 2 */

  /* USER CODE END USART2_Init 2 */

}

/**
  * @brief GPIO Initialization Function
  * @param None
  * @retval None
  */
static void MX_GPIO_Init(void)
{
  /* USER CODE BEGIN MX_GPIO_Init_1 */
  __HAL_RCC_GPIOC_CLK_ENABLE();
  /* USER CODE END MX_GPIO_Init_1 */

  /* GPIO Ports Clock Enable */
  __HAL_RCC_GPIOH_CLK_ENABLE();
  __HAL_RCC_GPIOA_CLK_ENABLE();

  /* USER CODE BEGIN MX_GPIO_Init_2 */
  GPIO_InitTypeDef GPIO_InitStruct = {0};

  GPIO_InitStruct.Pin = GPIO_PIN_13;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);
  /* USER CODE END MX_GPIO_Init_2 */
}

/* USER CODE BEGIN 4 */

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {
    if (huart->Instance == USART2) {
      // The data received is put in Rx buffer and then a stop command is added to the end
      rxBuffer[sizeof(rxBuffer) - 1] = '\0';
      // Data is now ready
      dataReady = 1;
      HAL_GPIO_TogglePin(GPIOC, 13);
      // CDC_Transmit_FS((uint8_t*)"hi\r\n", 4);  
      HAL_UART_Receive_IT(&huart2, (uint8_t*)rxBuffer, sizeof(rxBuffer));   
    }
}

}

/* USER CODE END 4 */

/**
  * @brief  This function is executed in case of error occurrence.
  * @retval None
  */
void Error_Handler(void)
{
  /* USER CODE BEGIN Error_Handler_Debug */
  /* User can add his own implementation to report the HAL error return state */
  __disable_irq();
  while (1)
  {
  }
  /* USER CODE END Error_Handler_Debug */
}
#ifdef USE_FULL_ASSERT
/**
  * @brief  Reports the name of the source file and the source line number
  *         where the assert_param error has occurred.
  * @param  file: pointer to the source file name
  * @param  line: assert_param error line source number
  * @retval None
  */
void assert_failed(uint8_t *file, uint32_t line)
{
  /* USER CODE BEGIN 6 */
  /* User can add his own implementation to report the file name and line number,
     ex: printf("Wrong parameters value: file %s on line %d\r\n", file, line) */
  /* USER CODE END 6 */
}
#endif /* USE_FULL_ASSERT */